import React from 'react';
import Queue from '../../_pages/Queue';
import { ConversationItem } from '../../App';

interface MainViewProps {
  conversation: ConversationItem[];
  onProcessingStateChange: (isProcessing: boolean) => void;
}

const MainView: React.FC<MainViewProps> = ({ conversation, onProcessingStateChange }) => {
  return (
    <div className="non-draggable h-full">
      <Queue
        conversation={conversation}
        onProcessingStateChange={onProcessingStateChange}
      />
    </div>
  );
};

export default MainView; 