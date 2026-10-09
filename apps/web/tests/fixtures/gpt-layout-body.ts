// Reproduces the complete public template structure reported in IMG_0934/0935.
export const layoutBodySample = `<box border radius="lg" padding={3} gap={3}>
  <row align=center gap={2}>
    <icon name="layers" color="secondary"/>
    **Одна оболочка — разные игровые интерфейсы**
  </row>
  <text color="secondary" size="xs">Пример предполагаемых названий и наполнения, не обещание уже реализованных адаптеров.</text>
{@body const tabs=[{game:"Pokémon",cols:["Home","Collections","Companions","Trainer","Social"],items:"Pokédex · Party · Boxes · Center / Journey · Hall"},{game:"Diablo",cols:["Home","Collections","Hero","Chronicle","Social"],items:"Character · Equipment · Skills · Stash / Quests · Milestones"},{game:"Need for Speed",cols:["Home","Collections","Garage","Career","Social"],items:"Cars · Upgrades · Collection / Events · Records"}]}
{#each tabs as t}
<box gap={1} key={t.game}>
<text weight="medium" size="sm">{t.game}</text>
<grid columns={5} gap="3px">
{#each t.cols as c,i}
<grid-item><box background={i===2||i===3?"rgba(74,144,113,0.13)":"surface-secondary"} radius="sm" padding={{x:1,y:2}} align=center justify=center minHeight="42px"><text size="3xs" weight="medium" textAlign="center">{c}</text></box></grid-item>
{/each}
</grid>
<text size="xs" color="secondary">{t.items}</text>
</box>
{/each}
</box>`;
