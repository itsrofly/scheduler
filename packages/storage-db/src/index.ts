import { PrismaClient as BasePrismaClient } from ".prisma/client";
import { fieldEncryptionExtension } from "prisma-field-encryption";
export * from "@prisma/client";

const createPrismaClient = () => {
    return new BasePrismaClient().$extends(
        fieldEncryptionExtension(),
    ) as BasePrismaClient;
};

export type PrismaClient = ReturnType<typeof createPrismaClient>;

export const PrismaClient = createPrismaClient;