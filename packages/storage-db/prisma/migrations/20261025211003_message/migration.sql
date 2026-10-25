-- CreateEnum
CREATE TYPE "TMethod" AS ENUM ('GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD');

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "method" "TMethod" NOT NULL,
    "body" TEXT,
    "bodyHash" TEXT,
    "retry" JSONB,
    "flowControl" JSONB,
    "delay" INTEGER,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("id")
);
