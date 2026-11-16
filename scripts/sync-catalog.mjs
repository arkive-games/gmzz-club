import fs from "node:fs";
import path from "node:path";
const root = path.resolve(import.meta.dirname, "..");
const source = process.argv[2] || path.resolve(root, "../data-gmzz");
const read = (file) =>
  JSON.parse(fs.readFileSync(path.join(source, file), "utf8"));
const skills = (file) =>
  read(file).map((x) => ({
    id: x.id,
    name: x.name,
    skill: x.skill.name,
    description: x.skill.brief.replace(/<[^>]*>/g, ""),
    icon: x.skill.icon,
  }));
const catalog = {
  professions: read("equipment/equipment.json")
    .professions.filter((x) => !x.disabled)
    .map(({ id, name, sequenceName }) => ({ id, name, sequenceName })),
  talents: read("score/talents.json").trees.map(
    ({ id, name, professionId, tag }) => ({ id, name, professionId, tag }),
  ),
  relics: read("relics/relics.json").artifacts.map(
    ({ id, name, groupId, groupName, description }) => ({
      id,
      name,
      groupId,
      groupName,
      description,
    }),
  ),
  puppets: skills("secretpartners/secretpartners.json"),
  fellows: skills("fellows/fellows.json"),
};
fs.writeFileSync(
  path.join(root, "server/catalog.json"),
  JSON.stringify(catalog, null, 2) + "\n",
);
console.log(
  `Catalog: ${catalog.relics.length} relics, ${catalog.puppets.length} puppets, ${catalog.fellows.length} fellows`,
);
