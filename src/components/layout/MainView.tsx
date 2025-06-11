import React from 'react';
import Queue from '../../_pages/Queue';
import { ConversationItem } from '../../App';

interface MainViewProps {
  conversation: ConversationItem[];
  onProcessingStateChange: (isProcessing: boolean) => void;
  onShowTutorial?: () => void;
}

const MainView: React.FC<MainViewProps> = ({ conversation, onProcessingStateChange, onShowTutorial }) => {
  return (
    <div className="non-draggable h-full">
      <Queue
        conversation={conversation}
        onProcessingStateChange={onProcessingStateChange}
        onShowTutorial={onShowTutorial}
      />
    </div>
  );
};

export default MainView; 