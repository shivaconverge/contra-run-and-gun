# Weapon-Defect Audit — creator round-2 (all 7 stages)

_Generated 2026-07-12T05:43:28.887Z by `feedback/audit/weapon-defect-audit.mjs`. Regenerate: `node feedback/audit/weapon-defect-audit.mjs`._

**VERDICT: PASS** — 7/7 stages clean. Muzzle tolerance 2px.

The creator round-2 REJECT is a FACT: does any armed entity show TWO weapons (a
gun baked into the sprite art AND a procedural code-drawn one)? The two entities
that overlay a procedural aiming weapon on a body — the surface of the defect — are
the **hero** (`drawGun`) and the **turret/cannon** (`drawTurretBarrel`), exactly the
two the creator named. This audit proves, per stage, that each shows ONE weapon and
fires from where that weapon is drawn.

## Layer A — static render-path invariants (shipped `game/src`)

| Check | Result | Detail |
|---|---|---|
| `A1.heroWeaponlessKeysOnly` | ✅ PASS | drawPlayer hero-body keys = [player_idle_noweapon, player_prone_noweapon, player_jump_noweapon, player_run_noweapon]; baked keys blitted = [none] |
| `A2.turretWeaponlessBody` | ✅ PASS | turret_base=true weaponlessFallback=true drawsBase=true bakedTurretBlitted=false |
| `A3.oneProceduralWeaponConfined` | ✅ PASS | drawGun calls=3 (all in drawPlayer=true); drawTurretBarrel calls=2 (all in drawEnemy=true) |
| `A4.heroShotFromDrawnMuzzle` | ✅ PASS | HERO_GUN{pivotY:0.30,muzzle:11} shared: render.drawGun uses .muzzle=true, player.shoot via heroMuzzle=true |
| `A5.turretShotFromDrawnBarrel` | ✅ PASS | render.drawTurretBarrel uses e.def.barrel{Pivot,Len}=true; enemy.js fire uses this.def.barrel{Pivot,Len}=true |
| `A6.otherArmedEnemiesWeaponless` | ✅ PASS | drawBoss weaponCalls={gun:0,barrel:0}, drawChopper weaponCalls={gun:0,barrel:0}, drawGun-in-drawEnemy=0 ⇒ boss/chopper/flyer/mortar/grunt carry no procedural overlay |

## Layer B — per-stage FACTS

| Stage | Theme | Two-weapon entities | Verdict | Red checks |
|---|---|---|---|---|
| 1 Jungle Approach | jungle | hero, turret | ✅ PASS | — |
| 2 Cascade Base | cascade | hero, turret | ✅ PASS | — |
| 3 Frozen Ridge | snow | hero, turret | ✅ PASS | — |
| 4 Scorched Dunes | desert | hero, turret | ✅ PASS | — |
| 5 Iron Foundry | foundry | hero, turret | ✅ PASS | — |
| 6 Crystal Caverns | caverns | hero, turret | ✅ PASS | — |
| 7 Red Falcon Keep | fortress | hero, turret | ✅ PASS | — |

### Stage 1 — Jungle Approach (jungle) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×15 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×5 → body `turret_base` + procedural `drawTurretBarrel`
- **flyer (drone)** ×2 → body `flyer` (single weapon, no overlay)
- **mortar (emplacement)** ×1 → body `mortar` (single weapon, no overlay)
- **boss (sentinel)** ×1 → body `boss_<theme>||boss_enraged||boss` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×5 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `flyer` ×2 → draws `none` (`drawEnemy→drawEnemySprite`, expected `none`)
- ✅ `mortar` ×1 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `boss` ×1 → draws `none` (`drawBoss`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 5 armed kinds draw one weapon type: hero→gun, turret→barrel, flyer→none, mortar→none, boss→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='jungle' (config='jungle'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 5/5 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 2 — Cascade Base (cascade) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×11 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×4 → body `turret_base` + procedural `drawTurretBarrel`
- **flyer (drone)** ×3 → body `flyer` (single weapon, no overlay)
- **mortar (emplacement)** ×2 → body `mortar` (single weapon, no overlay)
- **boss (chopper)** ×1 → body `boss_<theme>||chopper_enraged||chopper` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×4 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `flyer` ×3 → draws `none` (`drawEnemy→drawEnemySprite`, expected `none`)
- ✅ `mortar` ×2 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `chopper` ×1 → draws `none` (`drawChopper`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 5 armed kinds draw one weapon type: hero→gun, turret→barrel, flyer→none, mortar→none, chopper→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='cascade' (config='cascade'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 4/4 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 3 — Frozen Ridge (snow) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×9 → body `grunt` (single weapon, no overlay)
- **flyer (drone)** ×8 → body `flyer` (single weapon, no overlay)
- **turret (purple cannon)** ×3 → body `turret_base` + procedural `drawTurretBarrel`
- **boss (sentinel)** ×1 → body `boss_<theme>||boss_enraged||boss` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `flyer` ×8 → draws `none` (`drawEnemy→drawEnemySprite`, expected `none`)
- ✅ `turret` ×3 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `boss` ×1 → draws `none` (`drawBoss`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 4 armed kinds draw one weapon type: hero→gun, flyer→none, turret→barrel, boss→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='snow' (config='snow'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 3/3 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 4 — Scorched Dunes (desert) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×12 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×4 → body `turret_base` + procedural `drawTurretBarrel`
- **mortar (emplacement)** ×4 → body `mortar` (single weapon, no overlay)
- **boss (chopper)** ×1 → body `boss_<theme>||chopper_enraged||chopper` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×4 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `mortar` ×4 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `chopper` ×1 → draws `none` (`drawChopper`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 4 armed kinds draw one weapon type: hero→gun, turret→barrel, mortar→none, chopper→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='desert' (config='desert'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 4/4 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 5 — Iron Foundry (foundry) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×10 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×9 → body `turret_base` + procedural `drawTurretBarrel`
- **mortar (emplacement)** ×2 → body `mortar` (single weapon, no overlay)
- **boss (sentinel)** ×1 → body `boss_<theme>||boss_enraged||boss` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×9 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `mortar` ×2 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `boss` ×1 → draws `none` (`drawBoss`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 4 armed kinds draw one weapon type: hero→gun, turret→barrel, mortar→none, boss→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='foundry' (config='foundry'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 9/9 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 6 — Crystal Caverns (caverns) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×9 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×3 → body `turret_base` + procedural `drawTurretBarrel`
- **flyer (drone)** ×6 → body `flyer` (single weapon, no overlay)
- **mortar (emplacement)** ×5 → body `mortar` (single weapon, no overlay)
- **boss (chopper)** ×1 → body `boss_<theme>||chopper_enraged||chopper` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×3 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `flyer` ×6 → draws `none` (`drawEnemy→drawEnemySprite`, expected `none`)
- ✅ `mortar` ×5 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `chopper` ×1 → draws `none` (`drawChopper`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 5 armed kinds draw one weapon type: hero→gun, turret→barrel, flyer→none, mortar→none, chopper→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='caverns' (config='caverns'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 3/3 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

### Stage 7 — Red Falcon Keep (fortress) — PASS

Resolved bodies (armed entities):

- **hero (commando)** ×1 → body `player_idle_noweapon | player_run_noweapon | player_jump_noweapon | player_prone_noweapon` + procedural `drawGun`
- **grunt** ×11 → body `grunt` (single weapon, no overlay)
- **turret (purple cannon)** ×8 → body `turret_base` + procedural `drawTurretBarrel`
- **flyer (drone)** ×5 → body `flyer` (single weapon, no overlay)
- **mortar (emplacement)** ×3 → body `mortar` (single weapon, no overlay)
- **boss (sentinel)** ×1 → body `boss_<theme>||boss_enraged||boss` (single weapon, no overlay)

Every armed enemy — procedural weapon TYPE (static, from `render.js`; hero=gun, turret=barrel, all others=none; none draws two):

- ✅ `hero` ×1 → draws `gun` (`drawPlayer→drawGun`, expected `gun`)
- ✅ `turret` ×8 → draws `barrel` (`drawEnemy(turret)→drawTurretBarrel`, expected `barrel`)
- ✅ `flyer` ×5 → draws `none` (`drawEnemy→drawEnemySprite`, expected `none`)
- ✅ `mortar` ×3 → draws `none` (`drawEnemy→drawEnemySprite/placeholder`, expected `none`)
- ✅ `boss` ×1 → draws `none` (`drawBoss`, expected `none`)

- ✅ `static.renderPathInvariants` — LAYER A A1..A6 all hold (hero+turret weaponless bodies, one procedural weapon, shot==drawn muzzle, every other armed enemy overlay-free)
- ✅ `keys.noBakedWeaponBody` — two-weapon entities [turret, hero] resolve to weaponless bodies only
- ✅ `keys.everyArmedEnemyOneWeapon` — all 5 armed kinds draw one weapon type: hero→gun, turret→barrel, flyer→none, mortar→none, boss→none (hero=gun, turret=barrel, rest=none; none draws two)
- ✅ `runtime.themeBoots` — booted theme='fortress' (config='fortress'), status=playing
- ✅ `runtime.heroFromHandMuzzle` — bullet spawns 30% down body, forward-of-centre=true (<55% ⇒ hands, not waist)
- ✅ `runtime.turretFromBarrelTip` — 8/8 turrets fired; all shots at the drawn barrel tip=true (maxTipDist=0px ≤2, minDomeDist=11px ⇒ displaced from hull centre along the barrel)

## OPEN ISSUES

_None. Every stage shows exactly one weapon per armed entity, fired from where it is drawn._
