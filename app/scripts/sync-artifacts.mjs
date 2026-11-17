import { readFile, writeFile } from "node:fs/promises";
const names = [
  "PusakaV2Plan",
  "PusakaV2Anchor",
  "PusakaV2Inbox",
  "PusakaAssetPlan",
  "PusakaTokenVault",
];
for (const name of names) {
  const source = new URL(
    `../../contract/artifacts/solidcash/contracts/${name}.scash/${name}.json`,
    import.meta.url,
  );
  const target = new URL(`../src/lib/protocol/${name}.json`, import.meta.url);
  const artifact = JSON.parse(await readFile(source, "utf8"));
  if (artifact.contractName !== name)
    throw new Error(`Wrong compiled artifact: ${name}`);
  const data = JSON.stringify(artifact, null, 2) + "\n";
  if (process.argv.includes("--check")) {
    if (
      JSON.stringify(JSON.parse(await readFile(target, "utf8"))) !==
      JSON.stringify(artifact)
    )
      throw new Error(`Stale bundled artifact: ${name}`);
  } else await writeFile(target, data);
}
console.log("Five protocol artifacts match the compiled contracts.");
