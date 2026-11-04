import React, { useRef } from "react";
import { Button, Modal, Input } from "@/components/ui";

import { t } from "@/languages";

interface CreateFolderModalProps {
  isOpen: boolean;
  folderName: string;
  loading: boolean;
  onClose: () => void;
  onFolderNameChange: (name: string) => void;
  onCreate: () => void;
}

export const CreateFolderModal: React.FC<CreateFolderModalProps> = ({
  isOpen,
  folderName,
  loading,
  onClose,
  onFolderNameChange,
  onCreate,
}) => {
  // 提交中防重锁：快速双击「创建」/连按 Enter 会触发两次 onCreate（BUG-FS-01）。
  // 首次调用同步置位锁住后续调用；onCreate 返回的 Promise 完成后（无论成败）释放。
  // 用 ref 而非 state：避免锁位触发重渲染；组件卸载后释放仅写 ref，无 setState 警告。
  const submittingRef = useRef(false);

  const handleCreate = () => {
    if (submittingRef.current || loading) return;
    submittingRef.current = true;
    Promise.resolve(onCreate()).finally(() => {
      submittingRef.current = false;
    });
  };

  const handleClose = () => {
    onFolderNameChange("");
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={t("新建文件夹")}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose}>
            {t("取消")}
          </Button>
          <Button onClick={handleCreate}>{t("创建")}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label
            className="block font-medium mb-1"
            style={{ color: "var(--text-secondary)" }}
          >
            {t("名称 *")}
          </label>
          <Input
            data-tour="folder-name-input"
            value={folderName}
            onChange={(e) => onFolderNameChange(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleCreate()}
            placeholder={t("请输入文件夹名称")}
            autoFocus
          />
        </div>
      </div>
    </Modal>
  );
};

export default CreateFolderModal;
