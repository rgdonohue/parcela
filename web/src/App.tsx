import { useMemo } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { MapView } from './components/MapView';
import { ResultsPanel } from './components/ResultsPanel';
import { useChatStore } from './store/chat-store';
import { getChoroplethConfig } from './lib/choropleth';
import './App.css';

function App() {
  const {
    messages,
    isLoading,
    features,
    selectedFeature,
    currentQuery,
    queryMetadata,
    grounding,
    explanation,
    equityNarrative,
    showResults,
    sendMessage,
    selectFeature,
    clickFeature,
    closeResults,
  } = useChatStore();

  const choroplethConfig = useMemo(
    () => getChoroplethConfig(currentQuery, features),
    [currentQuery, features]
  );

  return (
    <div className="app-layout">
      <aside className="app-sidebar">
        <ChatPanel
          messages={messages}
          onSendMessage={sendMessage}
          isLoading={isLoading}
        />
      </aside>
      <main className="app-main">
        <MapView
          features={features}
          selectedFeature={selectedFeature}
          onFeatureClick={clickFeature}
          choroplethConfig={choroplethConfig}
          queryLayerName={currentQuery?.selectLayer ?? null}
        />
      </main>
      {showResults && (
        <aside className="app-results">
          <ResultsPanel
            features={features}
            selectedFeature={selectedFeature}
            query={currentQuery}
            metadata={queryMetadata}
            grounding={grounding}
            explanation={explanation}
            equityNarrative={equityNarrative}
            onFeatureSelect={selectFeature}
            onClose={closeResults}
          />
        </aside>
      )}
    </div>
  );
}

export default App;
