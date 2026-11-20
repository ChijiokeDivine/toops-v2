-- Chat: one global room, realtime messages, and PUSD tips between players.
-- Tips move money through the existing ledger; a ChatTip row is the idempotency
-- anchor so the two ledger entries can never be written twice for one tip.

ALTER TYPE "LedgerKind" ADD VALUE 'TIP';

CREATE TABLE "ChatMessage" (
  "id" TEXT NOT NULL,
  "channel" TEXT NOT NULL DEFAULT 'newcomers',
  "userId" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatMessage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatMessage_channel_createdAt_idx" ON "ChatMessage"("channel", "createdAt");
CREATE INDEX "ChatMessage_userId_idx" ON "ChatMessage"("userId");

ALTER TABLE "ChatMessage"
ADD CONSTRAINT "ChatMessage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChatTip" (
  "id" TEXT NOT NULL,
  "requestId" TEXT,
  "fromUserId" TEXT NOT NULL,
  "toUserId" TEXT NOT NULL,
  "amountPusd" BIGINT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ChatTip_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ChatTip_fromUserId_createdAt_idx" ON "ChatTip"("fromUserId", "createdAt");
CREATE INDEX "ChatTip_toUserId_createdAt_idx" ON "ChatTip"("toUserId", "createdAt");
CREATE UNIQUE INDEX "ChatTip_requestId_key" ON "ChatTip"("requestId");

ALTER TABLE "ChatTip"
ADD CONSTRAINT "ChatTip_fromUserId_fkey"
FOREIGN KEY ("fromUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChatTip"
ADD CONSTRAINT "ChatTip_toUserId_fkey"
FOREIGN KEY ("toUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
