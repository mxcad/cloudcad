import { RefreshCw } from 'lucide-react';
import React, { useState } from 'react';
import { Tabs, Tab } from './ui';
import { CurrentFilePanel } from './CurrentFilePanel';
import { WorkListPanel } from './WorkListPanel';
import { useCollaboration } from '../hooks/useCollaboration';
import styles from './CollaborateSidebar.module.css';
import { t } from '@/languages';

interface CollaborateSidebarProps {
  visible: boolean;
  onFileLoaded?: () => void;
}

export const CollaborateSidebar: React.FC<CollaborateSidebarProps> = ({
  visible,
  onFileLoaded,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'current' | 'list'>(
    'current'
  );

  const {
    works,
    currentWorkId,
    loading,
    creating,
    joiningWorkId,
    isCadReady,
    waitingForSession,
    fromShare,
    currentFileWorks,
    myWorks,
    projectWorks,
    currentFileName,
    fetchWorks,
    handleCreateWork,
    handleJoinWork,
    handleExitWork,
  } = useCollaboration(visible, onFileLoaded);

  return (
    <div className={styles.container} data-tour="collaborators-panel">
      <div className={styles.subTabBar}>
        <Tabs>
          <Tab
            active={activeSubTab === 'current'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('current')}
          >
            {t('当前图纸')}
          </Tab>
          <Tab
            active={activeSubTab === 'list'}
            tabVariant="primary"
            size="sm"
            onClick={() => setActiveSubTab('list')}
          >
            {t('协同列表')}
          </Tab>
        </Tabs>

        <button
          className={styles.toolbarRefreshBtn}
          onClick={() => fetchWorks(true)}
          disabled={loading}
          title={t('刷新列表')}
          aria-label={t('刷新列表')}
        >
          <RefreshCw className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className={styles.panelContent}>
        {activeSubTab === 'current' ? (
          <CurrentFilePanel
            works={currentFileWorks}
            currentWorkId={currentWorkId}
            fileName={currentFileName}
            isCadReady={isCadReady}
            creating={creating}
            joiningWorkId={joiningWorkId}
            waitingForSession={waitingForSession}
            fromShare={fromShare}
            onCreateWork={handleCreateWork}
            onJoinWork={handleJoinWork}
            onExitWork={handleExitWork}
          />
        ) : (
          <WorkListPanel
            myWorks={myWorks}
            projectWorks={projectWorks}
            loading={loading}
            currentWorkId={currentWorkId}
            joiningWorkId={joiningWorkId}
            onJoinWork={handleJoinWork}
            onExitWork={handleExitWork}
            onRefresh={fetchWorks}
          />
        )}
      </div>
    </div>
  );
};

export default CollaborateSidebar;
