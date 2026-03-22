/**
 * Intent Parser
 * 
 * Converts natural language queries into StructuredQuery using LLM.
 * Includes prompt engineering with layer schemas and few-shot examples.
 */

import type { LLMClient } from '../llm/types';
import type { StructuredQuery } from '../../../../shared/types/query';
import { safeValidateQuery } from './validator';
import { LAYER_SCHEMAS } from '../../../../shared/types/geo';

/**
 * Parse result with confidence score
 */
export interface ParseResult {
  query: StructuredQuery;
  confidence: number; // 0.0-1.0
  rawResponse: string; // Original LLM response for debugging
}

/**
 * Conversation context from a previous turn.
 * Allows the parser to resolve references like "those", "filter further",
 * "now show just the Southside", etc.
 */
export interface ConversationContext {
  previousQuery: StructuredQuery;
  previousLayer: string;
  previousResultCount: number;
  previousExplanation: string;
}

/**
 * Intent parser that converts NL → StructuredQuery
 */
export class IntentParser {
  private availableLayers: Set<string> = new Set();
  private availableLayerFields: Map<string, Set<string>> = new Map();

  constructor(private llm: LLMClient) {}

  /**
   * Set which layers are actually available in the database
   * This restricts the LLM to only suggest queries against loaded data
   */
  setAvailableLayers(layers: string[]): void {
    this.availableLayers = new Set(layers);
  }

  /**
   * Set runtime-queryable fields for each loaded layer.
   * This keeps prompts aligned with actual loaded data columns.
   */
  setAvailableLayerFields(layerFields: Record<string, string[]>): void {
    this.availableLayerFields = new Map(
      Object.entries(layerFields).map(([layerName, fields]) => [
        layerName,
        new Set(fields),
      ])
    );
  }

  /**
   * Get list of available layers
   */
  getAvailableLayers(): string[] {
    return Array.from(this.availableLayers);
  }

  /**
   * Parse a natural language query into a StructuredQuery
   *
   * @param userQuery - The user's natural language query
   * @param context - Optional conversation context from previous turn
   * @returns ParseResult with query and confidence score
   * @throws Error if parsing fails completely
   */
  async parse(
    userQuery: string,
    context?: ConversationContext | null
  ): Promise<ParseResult> {
    const prompt = this.buildPrompt(userQuery, context ?? null);
    const rawResponse = await this.llm.complete(prompt);

    // Extract JSON from response
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('LLM did not return valid JSON');
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (error) {
      throw new Error(`Failed to parse JSON from LLM response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Validate against schema
    const validation = safeValidateQuery(parsed);
    if (!validation.success) {
      // Lower confidence but still try to return something useful
      throw new Error(
        `Query validation failed: ${validation.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`
      );
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(userQuery, validation.data, rawResponse);

    return {
      query: validation.data,
      confidence,
      rawResponse,
    };
  }

  /**
   * Build the prompt with layer schemas, examples, and optional conversation context
   */
  private buildPrompt(
    userQuery: string,
    context: ConversationContext | null
  ): string {
    // Filter to only available layers (if set), otherwise show all
    const layersToShow = this.availableLayers.size > 0
      ? Object.values(LAYER_SCHEMAS).filter((s) => this.availableLayers.has(s.name))
      : Object.values(LAYER_SCHEMAS);

    // Build layer schema descriptions
    const layerDescriptions = layersToShow
      .map((schema) => {
        const runtimeFieldSet = this.availableLayerFields.get(schema.name);
        const fieldEntries = runtimeFieldSet
          ? Object.entries(schema.fields).filter(([name]) => runtimeFieldSet.has(name))
          : Object.entries(schema.fields);
        const fields = fieldEntries
          .map(([name, type]) => `    - ${name}: ${type}`)
          .join('\n');
        return `  - ${schema.name} (${schema.geometryType}): ${schema.description || 'No description'}\n${fields}`;
      })
      .join('\n\n');

    // Build examples that use available layers
    const examples = this.buildExamples();

    // Build conversation context section if available
    const contextSection = context
      ? `
Conversation context (previous query):
- Layer: ${context.previousLayer}
- Result: ${context.previousResultCount} features
- Explanation: "${context.previousExplanation}"
- Previous query: ${JSON.stringify(context.previousQuery)}

If the user's new query refers to the previous results (e.g. "filter those", "now just show...", "of those which...", "narrow that down"), build on the previous query by adding or modifying filters. Keep the same selectLayer unless the user explicitly asks for a different layer.
`
      : '';

    return `You are a spatial query parser for Santa Fe, New Mexico. Convert natural language queries into structured JSON queries.

Available layers:
${layerDescriptions}

IMPORTANT:
- Use only layers and fields listed above.
- Do not invent layers or fields that are not listed.
- Do not substitute unavailable concepts with "closest alternatives".

Supported operations:
- Attribute filters: eq, neq, gt, gte, lt, lte, in, like
- Spatial filters: within_distance (meters), intersects, contains, within, nearest
- Logical operators: and, or (for combining multiple filters)

Output ONLY valid JSON matching this schema:
{
  "selectLayer": "string",
  "selectFields": ["string"] (optional),
  "attributeFilters": [{"field": "string", "op": "string", "value": "any"}] (optional),
  "attributeLogic": "and" | "or" (optional, default: "and"),
  "spatialFilters": [{"op": "string", "targetLayer": "string", "targetFilter": [...] (optional), "distance": number (for within_distance), "limit": number (for nearest)}] (optional),
  "spatialLogic": "and" | "or" (optional, default: "and"),
  "aggregate": {"groupBy": ["string"], "metrics": [{"field": "string", "op": "count|sum|avg|median|min|max", "alias": "string" (optional)}]} (optional),
  "temporal": {"baseline": {"year": number} | {"date": "YYYY-MM-DD"}, "comparison": {"year": number} | {"date": "YYYY-MM-DD"}, "metric": "string"} (optional),
  "limit": number (optional, max 1000),
  "orderBy": {"field": "string", "direction": "asc" | "desc"} (optional)
}

Examples:
${examples}
${contextSection}
Now parse this query:
User: "${userQuery}"

Output only the JSON object, no other text:`;
  }

  /**
   * Calculate confidence score for the parsed query
   * 
   * Factors:
   * - Validation success (required, otherwise error thrown)
   * - Layer/field references match available schemas
   * - Response quality indicators
   */
  private calculateConfidence(
    userQuery: string,
    query: StructuredQuery,
    rawResponse: string
  ): number {
    let confidence = 0.8; // Base confidence if validation passed

    // Check if layer exists
    if (!(query.selectLayer in LAYER_SCHEMAS)) {
      confidence -= 0.3;
    }

    // Check if referenced fields exist in layer schema
    const layerSchema = LAYER_SCHEMAS[query.selectLayer];
    if (layerSchema) {
      const runtimeFields = this.availableLayerFields.get(query.selectLayer);

      // Check attribute filter fields
      if (query.attributeFilters) {
        for (const filter of query.attributeFilters) {
          const fieldExistsInSchema = filter.field in layerSchema.fields;
          const fieldExistsAtRuntime = runtimeFields
            ? runtimeFields.has(filter.field)
            : true;
          if (!fieldExistsInSchema || !fieldExistsAtRuntime) {
            confidence -= 0.1;
          }
        }
      }

      // Check spatial filter target layers
      if (query.spatialFilters) {
        for (const filter of query.spatialFilters) {
          if (!(filter.targetLayer in LAYER_SCHEMAS)) {
            confidence -= 0.2;
          }
        }
      }
    }

    // Check for uncertainty markers in raw response
    const uncertaintyMarkers = [
      'uncertain',
      'not sure',
      'might be',
      'possibly',
      'maybe',
      '?',
    ];
    const lowerResponse = rawResponse.toLowerCase();
    if (uncertaintyMarkers.some((marker) => lowerResponse.includes(marker))) {
      confidence -= 0.2;
    }

    // Ensure confidence is between 0 and 1
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Build examples based on available layers
   * Uses only layers that are actually loaded
   */
  private buildExamples(): string {
    const hasLayer = (name: string) =>
      this.availableLayers.size === 0 || this.availableLayers.has(name);

    const examples: string[] = [];

    // Parcel examples
    if (hasLayer('parcels')) {
      examples.push(`User: "Show all parcels"
{
  "selectLayer": "parcels"
}

User: "Show residential parcels"
{
  "selectLayer": "parcels",
  "attributeFilters": [
    {"field": "land_use", "op": "like", "value": "%RESIDENTIAL%"}
  ]
}

User: "Parcels with assessed value over 500000"
{
  "selectLayer": "parcels",
  "attributeFilters": [
    {"field": "assessed_value", "op": "gt", "value": 500000}
  ]
}

User: "Show vacant lots"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within",
      "targetLayer": "parcels"
    }
  ],
  "attributeFilters": [
    {"field": "land_use", "op": "like", "value": "%VACANT%"}
  ]
}`);
    }

    // Building footprint examples
    if (hasLayer('building_footprints')) {
      examples.push(`User: "Show all buildings"
{
  "selectLayer": "building_footprints"
}

User: "Show buildings taller than 30 feet"
{
  "selectLayer": "building_footprints",
  "attributeFilters": [
    {"field": "height", "op": "gt", "value": 30}
  ]
}

User: "Buildings built after 2020"
{
  "selectLayer": "building_footprints",
  "attributeFilters": [
    {"field": "year_built", "op": "gt", "value": 2020}
  ]
}

User: "Commercial buildings"
{
  "selectLayer": "building_footprints",
  "attributeFilters": [
    {"field": "building_type", "op": "like", "value": "%COMMERCIAL%"}
  ]
}`);
    }

    // Zoning examples
    if (hasLayer('zoning_districts')) {
      examples.push(`User: "Show all zoning districts"
{
  "selectLayer": "zoning_districts"
}

User: "Show residential zones"
{
  "selectLayer": "zoning_districts",
  "attributeFilters": [
    {"field": "zone_code", "op": "like", "value": "R%"}
  ]
}

User: "Show R1 residential zones"
{
  "selectLayer": "zoning_districts",
  "attributeFilters": [
    {"field": "zone_code", "op": "like", "value": "R1%"}
  ]
}

User: "Show commercial zones"
{
  "selectLayer": "zoning_districts",
  "attributeFilters": [
    {"field": "zone_code", "op": "like", "value": "C%"}
  ]
}`);
    }

    // Census tract examples
    if (hasLayer('census_tracts')) {
      examples.push(`User: "Show all census tracts"
{
  "selectLayer": "census_tracts"
}

User: "Show census tracts by income"
{
  "selectLayer": "census_tracts",
  "orderBy": {"field": "median_income", "direction": "desc"}
}

User: "Census tracts with median income below 50000"
{
  "selectLayer": "census_tracts",
  "attributeFilters": [
    {"field": "median_income", "op": "lt", "value": 50000}
  ]
}

User: "Show census tracts with high renter percentage"
{
  "selectLayer": "census_tracts",
  "attributeFilters": [
    {"field": "pct_renter", "op": "gt", "value": 50}
  ]
}

User: "Census tracts ordered by population"
{
  "selectLayer": "census_tracts",
  "orderBy": {"field": "total_population", "direction": "desc"}
}`);
    }

    // Hydrology examples
    if (hasLayer('hydrology')) {
      examples.push(`User: "Show the hydrology network"
{
  "selectLayer": "hydrology"
}

User: "Show all arroyos"
{
  "selectLayer": "hydrology"
}`);
    }

    // Spatial query examples (only if both layers available)
    if (hasLayer('zoning_districts') && hasLayer('hydrology')) {
      examples.push(`User: "Zoning districts near arroyos"
{
  "selectLayer": "zoning_districts",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "hydrology",
      "distance": 200
    }
  ]
}`);
    }

    if (hasLayer('census_tracts') && hasLayer('zoning_districts')) {
      examples.push(`User: "Census tracts that intersect commercial zoning"
{
  "selectLayer": "census_tracts",
  "spatialFilters": [
    {
      "op": "intersects",
      "targetLayer": "zoning_districts",
      "targetFilter": [{"field": "zone_code", "op": "like", "value": "C%"}]
    }
  ]
}`);
    }

    // Transit examples
    if (hasLayer('transit_access')) {
      examples.push(`User: "Show all transit stops"
{
  "selectLayer": "transit_access"
}

User: "Show wheelchair accessible stops"
{
  "selectLayer": "transit_access",
  "attributeFilters": [
    {"field": "wheelchair_accessible", "op": "eq", "value": true}
  ]
}`);
    }

    if (hasLayer('transit_access') && hasLayer('parks')) {
      examples.push(`User: "Transit stops near parks"
{
  "selectLayer": "transit_access",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "parks",
      "distance": 500
    }
  ]
}`);
    }

    // Short-term rental examples
    if (hasLayer('short_term_rentals')) {
      examples.push(`User: "Show all short-term rentals"
{
  "selectLayer": "short_term_rentals"
}

User: "Short-term rentals near downtown"
{
  "selectLayer": "short_term_rentals",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "census_tracts",
      "distance": 1000
    }
  ]
}

User: "STR permits issued in 2024"
{
  "selectLayer": "short_term_rentals",
  "attributeFilters": [
    {"field": "permit_issued_date", "op": "like", "value": "2024%"}
  ]
}

User: "Short-term rentals by neighborhood"
{
  "selectLayer": "short_term_rentals",
  "aggregate": {
    "groupBy": ["address"],
    "metrics": [{"field": "*", "op": "count", "alias": "str_count"}]
  }
}`);
    }

    // Flood zone examples
    if (hasLayer('flood_zones')) {
      examples.push(`User: "Show flood zones"
{
  "selectLayer": "flood_zones"
}

User: "High risk flood areas"
{
  "selectLayer": "flood_zones",
  "attributeFilters": [
    {"field": "flood_risk_level", "op": "eq", "value": "high"}
  ]
}

User: "Parcels in flood zones"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "intersects",
      "targetLayer": "flood_zones"
    }
  ]
}`);
    }

    // Historic district examples
    if (hasLayer('historic_districts')) {
      examples.push(`User: "Show historic districts"
{
  "selectLayer": "historic_districts"
}

User: "Parcels in historic districts"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within",
      "targetLayer": "historic_districts"
    }
  ]
}`);
    }

    // Neighborhood examples
    if (hasLayer('neighborhoods')) {
      examples.push(`User: "Show all neighborhoods"
{
  "selectLayer": "neighborhoods"
}

User: "STRs by neighborhood"
{
  "selectLayer": "short_term_rentals",
  "spatialFilters": [
    {
      "op": "within",
      "targetLayer": "neighborhoods"
    }
  ]
}

User: "Parcels in a specific neighborhood"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within",
      "targetLayer": "neighborhoods",
      "targetFilter": [{"field": "name", "op": "like", "value": "%Downtown%"}]
    }
  ]
}`);
    }

    // City limits examples
    if (hasLayer('city_limits')) {
      examples.push(`User: "Show city limits"
{
  "selectLayer": "city_limits"
}

User: "Parcels within city limits"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within",
      "targetLayer": "city_limits"
    }
  ]
}`);
    }

    // Parks examples
    if (hasLayer('parks')) {
      examples.push(`User: "Show all parks"
{
  "selectLayer": "parks"
}

User: "Parcels near parks"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "parks",
      "distance": 400
    }
  ]
}

User: "Large parks over 10 acres"
{
  "selectLayer": "parks",
  "attributeFilters": [
    {"field": "acres", "op": "gt", "value": 10}
  ]
}`);
    }

    // Bikeways examples
    if (hasLayer('bikeways')) {
      examples.push(`User: "Show bikeways"
{
  "selectLayer": "bikeways"
}

User: "Parcels near bike paths"
{
  "selectLayer": "parcels",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "bikeways",
      "distance": 200
    }
  ]
}

User: "Transit stops along bikeways"
{
  "selectLayer": "transit_access",
  "spatialFilters": [
    {
      "op": "within_distance",
      "targetLayer": "bikeways",
      "distance": 100
    }
  ]
}`);
    }

    return examples.join('\n\n');
  }
}
