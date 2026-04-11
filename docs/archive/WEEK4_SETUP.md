# Week 4: LLM Integration Setup Guide

This guide helps you set up and test the LLM integration for Week 4.

## Prerequisites

1. **Ollama installed and running**
   ```bash
   # Install Ollama (if not already)
   # macOS:
   brew install ollama
   # or download from https://ollama.ai/
   
   # Start Ollama service
   ollama serve
   ```

2. **Pull the model**
   ```bash
   # Recommended model (small, fast, good for structured output)
   ollama pull qwen2.5:7b
   
   # Alternative (slightly larger, may be more accurate)
   # ollama pull llama3.1:8b
   ```

3. **Verify Ollama is running**
   ```bash
   # Test the API
   curl http://localhost:11434/api/tags
   # Should return a list of available models
   ```

## Project Structure

The LLM integration consists of:

```
api/src/lib/llm/
  ├── types.ts          # LLMClient interface
  ├── ollama.ts         # Ollama implementation
  └── index.ts          # Exports

api/src/lib/orchestrator/
  ├── parser.ts         # IntentParser (NL → StructuredQuery)
  ├── builder.ts        # QueryBuilder (StructuredQuery → SQL)
  └── validator.ts      # Zod validation schemas

api/src/routes/
  └── chat.ts           # /api/chat endpoint
```

## Configuration

Environment variables (optional, defaults shown):

```bash
# .env file or environment variables
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=qwen2.5:7b
```

## Testing the Integration

### 1. Start the API server

```bash
cd api
npm run dev
```

The server should start on port 3000.

### 2. Test the chat endpoint

```bash
# Simple query
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show residential parcels"}'

# Spatial query
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Parcels within 500 meters of the Santa Fe River"}'

# Complex query
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Vacant parcels near transit stops"}'
```

### 3. Run unit tests

```bash
cd api
npm test parser.test.ts
```

### 4. Manual testing script

Create a simple test script:

```typescript
// test-parser.ts
import { OllamaClient } from './src/lib/llm';
import { IntentParser } from './src/lib/orchestrator/parser';

async function testParser() {
  const llm = new OllamaClient();
  const parser = new IntentParser(llm);

  const queries = [
    'Show residential parcels',
    'Parcels within 500 meters of the Santa Fe River',
    'Census tracts with median income below 40000',
  ];

  for (const query of queries) {
    console.log(`\nQuery: "${query}"`);
    try {
      const result = await parser.parse(query);
      console.log('Parsed:', JSON.stringify(result.query, null, 2));
      console.log('Confidence:', result.confidence);
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : error);
    }
  }
}

testParser();
```

Run with:
```bash
tsx test-parser.ts
```

## Expected Behavior

### Successful Parse

```json
{
  "query": {
    "selectLayer": "parcels",
    "attributeFilters": [
      {"field": "zoning", "op": "in", "value": ["R-1", "R-2", "R-3"]}
    ]
  },
  "confidence": 0.8,
  "rawResponse": "..."
}
```

### Error Cases

1. **Ollama not running**
   ```json
   {
     "error": "LLM service unavailable",
     "message": "Cannot connect to Ollama. Is it running?",
     "suggestions": [...]
   }
   ```

2. **Invalid query**
   ```json
   {
     "error": "Could not understand query",
     "message": "Query validation failed: ...",
     "suggestions": [...]
   }
   ```

## Troubleshooting

### Ollama connection errors

- **Check Ollama is running**: `curl http://localhost:11434/api/tags`
- **Check model is pulled**: `ollama list`
- **Check port**: Default is 11434, set `OLLAMA_BASE_URL` if different

### Parsing quality issues

- **Try different model**: `ollama pull llama3.1:8b`
- **Adjust temperature**: Edit `ollama.ts` to change default temperature
- **Improve prompt**: Edit `parser.ts` `buildPrompt()` method

### Validation errors

- Check that layer names match `LAYER_SCHEMAS` in `shared/types/geo.ts`
- Verify field names exist in layer schema
- Check operation types match allowed values

## Next Steps

After Week 4 is complete:

1. **Week 5**: Build frontend UI components
2. **Week 6**: Add ResultExplainer for natural language summaries
3. **Week 7**: Add error handling and security
4. **Week 8**: Deploy to production

## Resources

- [Ollama Documentation](https://ollama.ai/)
- [Prompt Engineering Guide](https://www.promptingguide.ai/)
- [Qwen 2.5 Model Card](https://huggingface.co/Qwen/Qwen2.5-7B-Instruct)

