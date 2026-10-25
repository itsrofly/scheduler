import { PrismaClient } from "./index";
import { v4 as uuidv4 } from 'uuid';

const prisma = PrismaClient()

async function main() {
    const id = 'b18794e8-5d0d-417c-b361-ba38e78411b4'

    const message = await prisma.message.upsert({
        where: {
            id,
        },
        update: {},
        create: {
            id,
            url: "https://api.example.com/v1/endpoint",
            method: "POST",
            body: JSON.stringify({
                message: "Hello, World"
            }),
            retry: { // In case of failures, will try attempts below, respecting the delay between attempts
                attempts: 3,
                delay: 3000 // 3 seconds in milliseconds
            },
            flowControl: {
                id: 'rate-id',
                rate: 3, // Max 3 jobs in the period below
                period: 3000, // 3 seconds in milliseconds
                concurrency: 1 // Max 1 job running at same time
            },
            delay: 0,
        },
    });

    console.log({ message });
}

main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });