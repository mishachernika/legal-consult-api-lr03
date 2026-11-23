-- CreateIndex
CREATE INDEX "EventOutbox_room_id_idx" ON "EventOutbox"("room", "id");

-- CreateIndex
CREATE INDEX "Notification_userId_readAt_idx" ON "Notification"("userId", "readAt");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");
