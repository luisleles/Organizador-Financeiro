import { prisma } from "../src/lib/prisma";

async function main() {
  console.log("Nenhum dado inicial definido ainda.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
