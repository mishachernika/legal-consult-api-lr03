-- Пагінація непрочитаних сповіщень фільтрує за userId/readAt і сортує за createdAt DESC.
-- Один складений індекс відповідає всім трьом частинам запиту.
DROP INDEX "Notification_userId_readAt_idx";

CREATE INDEX "Notification_userId_readAt_createdAt_idx"
ON "Notification"("userId", "readAt", "createdAt" DESC);
