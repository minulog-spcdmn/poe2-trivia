# Wraeclast world map research (for poe2.quest "map run" mode)

Researched 2026-10-19. poe2wiki.net and poewiki.net could not be read (Anubis bot wall, also via curl), so wiki facts come from poe2db.tw / poedb.tw (data-mined game text) and GGG's own pages instead.

## 1. Which illustrated Wraeclast map exists

### A. "Path of Exile 2 - Map of Wraeclast" (the best match, current)
- Official GGG-licensed artwork, sold as a Displate metal poster in the "Chronicles of Wraeclast" collection: https://displate.com/displate/9211583 (collection page: https://displate.com/licensed/path-of-exile). The artwork credit is "Path of Exile" (licensor); no artist named. CDN date on the file: 2025-12-11 (released alongside 0.4 "The Last of the Druids"; GGG's forum announcement of the new Displates: https://www.pathofexile.com/forum/view-thread/3896623 , which does not list titles).
- Image: `https://cdn.displate.com/artwork/{W}x{H}/2025-12-11/9f41f8253a9e59c33a9c104b8f686359_11ef43cf71660a910557bb1aa4d147ec.jpg`. Asking for 6000x4284 returned **2880x2066**, which looks like the largest the CDN serves (3000/4800 requests come back as upscales). All CDN versions carry a **Displate "D★" watermark** tiled across the image, so this file is a reference, not a clean asset.
- Content: the whole continent on sepia parchment, landscape format, compass rose bottom right. Hand-drawn mountains, forests, cliffs, rivers, and 38 lettered names with small building icons for settlements. Covers the PoE1 and PoE2 campaign areas plus the Karui islands and Oriath.
- In-game use: I found **no evidence** that this full-continent painting is used in-game. PoE2's in-game World panel uses per-act maps (poe2db shows assets under `Art/2DArt/UIImages/InGame/WorldMap/Act1..Act4/Interlude`), and I found no whole-continent background there. This matches the designer's "illustrated but not really used in-game". **Not verified** either way from inside the client.
- Local reference copies (watermarked): `/tmp/claude-0/-home-claude/54ddee3a-7e67-507b-ab98-8f97bbb99d3a/scratchpad/me/research/dl/m_6000x4284.jpg` (2880x2066), zoomed label crops in `.../dl/z/` and `.../dl/q/`.

### B. The 2012 PoE1 "Wraeclast" map (ancestor)
- GGG wallpaper "© 2012 Grinding Gear Games", 1920x1080, red-tinted, with "Wraeclast" lettering. Copy found via forum thread https://www.pathofexile.com/forum/view-thread/449437 → http://static.giantbomb.com/uploads/original/13/130632/2432221-7269184407-path_.jpg . It was also printed as a poster for early supporter packs (Bex_GGG, 2014: "There were posters made of the map of Wraeclast previously", https://www.pathofexile.com/forum/view-thread/956896). The official wallpaper URL (webcdn.pathofexile.com …wallpaper3_1920x1080.jpg) now returns 403.
- It is the **same landmass** (same volcano island, Argyr Flats, Azmerian Ranges, Vastiri Plains, Lira Vaal, Mt Vastiri, Ezomyr, Theopolis/Oriath are readable), but drawn at a different orientation and resolution, with the labels mostly unreadable. The PoE2 Displate map is a redrawn, updated version (it adds Clearfell, Ogham Village, Kingsmarch, Utzaal, Ngamakanui and others).
- Fan-made maps such as NerdyMaps (https://nerdymaps.com/producto/wraeclast-map-path-of-exile/) are **not official**. Ignore them.

## 2. Named places ON the PoE2 map illustration (all 38 labels)

These are read by eye from the 2880x2066 render. x and y are fractions of that full image, border included, with 0,0 at top left. Positions are approximate (±0.01-0.02) and give the label centre (or the icon, if there is one).
"Reading" = how sure I am of the spelling. The blackletter font makes d look like v and A like d. "Game status" = what I could confirm from game text (poe2db/poedb) or GGG pages.

| # | Label on map | x | y | Icon | Reading | Game status / source of name |
|---|---|---|---|---|---|---|
| 1 | Clearfell | .48 | .24 | – | sure | PoE2 Act 1 zone; Act 1 town is "Clearfell Encampment" (poe2db Act 1) |
| 2 | Phaaryl | .42 | .25 | – | sure | Lore region (PoE2 Druid unique flavour text "Phaaryl and Ezomyr"; PoE1 Kirac "Battle of Phaaryl") |
| 3 | Ogham Village | .48 | .27 | building | sure | PoE2 Act 1 zone |
| 4 | Maraketh | .58 | .28 | tower | likely | Maraketh = desert people (PoE2 Act 2, Interlude "Recruit the Maraketh"). As a place label, it is not verified as a game zone |
| 5 | Parima Trading Outpost | .52 | .35 | tents | first word uncertain | **Not found** in game data |
| 6 | Keth | .57 | .38 | tower | sure | PoE2 Act 2 zone |
| 7 | Gizem Locks | .62 | .37 | gate | probable | **Not found** |
| 8 | Lira Vaal | .52 | .39 | ruins | sure | Also on the 2012 map. Not found as a game zone |
| 9 | Vastiri Plains (region) | .56 | .41 | – | sure | Vastiri = PoE2 Act 2 desert ("Vastiri Outskirts" zone) |
| 10 | Mt Vastiri | .62 | .41 | mountain | sure | Not found as a zone |
| 11 | Burial Towers | .66 | .40 | tower | sure | **Not found** |
| 12 | Highgate | .46 | .42 | building | sure | PoE1 Act 4/9 town (PoE2 has Highgate hideout decorations) |
| 13 | Mt Kalisa | .50 | .43 | mountain | sure | **Not found** |
| 14 | Pondium | .77 | .46 | – | probable | **Not found** |
| 15 | Stridevolf | .65 | .47 | building | sure | Lore town (PoE1 library: "Governor Kastov of Stridevolf"; PoE2 Orbala lore "Stridevolf in flames") |
| 16 | Sarn | .47 | .48 | tower | sure | PoE1 Act 3/8 city (town: Sarn Encampment) |
| 17 | Argyr Flats | .38 | .48 | – | sure | Also on the 2012 map. Not found as a zone |
| 18 | Utzaal | .56 | .49 | building | sure | PoE2 Act 3 zone |
| 19 | The Mantle | .46 | .51 | cliffs | sure | **Not found** |
| 20 | Azmerian Ranges | .40 | .52 | mountains | sure | PoE2 endgame map "Azmerian Ranges" (poe2db); Azmeri people |
| 21 | Phrecian Forest | .50 | .55 | forest | sure | Phrecia (PoE1 lore, "Archbishop Geofri of Phrecia") |
| 22 | Fellshrine | .63 | .55 | – | sure | PoE1 Act 2 "Fellshrine Ruins" |
| 23 | Lake Constance | .56 | .56 | lake | probable | **Not found** |
| 24 | Ezomyr | .26 | .57 | – | sure | Ezomyte homeland (PoE1/PoE2 lore, PoE2 Interlude "Recruit the Ezomytes") |
| 25 | Riben Fell | .64 | .58 | building | probable | **Not found** |
| 26 | Mt Chuplaigh | .43 | .61 | mountain | probable | **Not found** |
| 27 | Kingsmarch | .59 | .61 | windmill | sure | PoE2 Act 4 town (also the PoE1 Settlers town) |
| 28 | Ngakanu Island | .63 | .62 | – | sure | PoE2 Act 4 zone "Ngakanu" |
| 29 | ?-a-?-a Atua Ranges (e.g. "Wahaka/Mataya Atua") | .41 | .64 | mountains | **first word unreadable** | **Not found** |
| 30 | Silenus Bluffs | .51 | .65 | cliffs | sure | **Not found** |
| 31 | Northern Ngamakanui | .58 | .65 | islands | sure | Ngamakanui = PoE2 Act 4 island region (poe2db: "The islands of Ngamakanui") |
| 32 | Lioneye's Watch | .49 | .75 | tower | sure | PoE1 Act 1/6 town |
| 33 | Theopolis | .57 | .76 | cathedral | sure | Oriath's capital (PoE1 Acts 5/10) |
| 34 | Oriath Harbour | .63 | .76 | building | sure | Oriath (PoE1). The exact label "Oriath Harbour" is not verified as a zone (PoE1 has "Oriath Docks") |
| 35 | Karui Archipelago (region) | .42 | .78 | – | sure | Also a Displate poster title; PoE2 Act 4 region |
| 36 | Te Onui | .45 | .84 | – | probable | **Not found** |
| 37 | Ngamakanui | .42 | .86 | – | sure | PoE2 Act 4 region |
| 38 | Cape Awanotui | .28 | .86 | – | probable | **Not found** |

Icons with no label (they do not count as nodes): a ziggurat/step-pyramid just west of Utzaal (x .53, y .50; possibly the Act 3 "Ziggurat Encampment", **unverified**), and a black vortex/whirlpool east of Riben Fell (x .68, y .57; unknown).

Unlabeled land areas include the volcano island in the far NW, the western peninsula, the large north-east plain north of Maraketh, and the many eastern islands.

**Important: places that are in the game but NOT on the illustration** include The Riverbank, The Grelwood, Red Vale, Ogham Manor, The Ardura Caravan, Halani Gates, Mastodon Badlands, Deshar, Dreadnought, Sandswept Marsh, Jungle Ruins, Aggorat, Kedge Bay, Whakapanu Island, Shrike Island, Arastas, Holten, Wolvenhold, Qimah and Kriar Village. These are listed on the poe2db Act pages. None of them has a drawn position on this map, so under the "real spot on the map" rule they cannot be nodes.

## 3. Towns / encampments and a geographic order

Towns on the map that really are towns in a game:
- Clearfell (PoE2 Act 1 town = Clearfell Encampment): the natural **step 0 camp**. It sits at the north end.
- Highgate (PoE1 town), Sarn (PoE1 encampment), Kingsmarch (PoE2 Act 4 town), Lioneye's Watch (PoE1 town), Theopolis / Oriath Harbour (PoE1 Oriath).
- Settlement icons that are lore towns but not in-game hubs: Ogham Village, Keth, Utzaal, Stridevolf, Maraketh, Burial Towers, Riben Fell, Gizem Locks, Parima Trading Outpost.

The PoE2 campaign runs roughly **north to south**: Ogham (Act 1) → Vastiri (Act 2) → Utzaal (Act 3) → Kingsmarch and the Ngamakanui islands (Act 4). Lioneye's Watch and Oriath lie further south and south-east, so a north-to-south route is lore-faithful.

Draft 17-step layout (y increases downward; it is only a sketch):

| Step | Nodes |
|---|---|
| 0 camp | Clearfell |
| 1 | Phaaryl, Ogham Village, Maraketh |
| 2 | Parima Trading Outpost, Keth, Gizem Locks |
| 3 | Lira Vaal, Mt Vastiri, Burial Towers (or Vastiri Plains) |
| 4 town | Highgate |
| 5 | Mt Kalisa, Stridevolf, Pondium |
| 6 | Sarn, Utzaal, The Mantle (Argyr Flats as an alternative) |
| 7 | Phrecian Forest, Lake Constance, Fellshrine |
| 8 town | Kingsmarch |
| 9 | Riben Fell, Ngakanu Island, Northern Ngamakanui |
| 10 | Mt Chuplaigh, "… Atua Ranges", Silenus Bluffs |
| 11 | Azmerian Ranges, Argyr Flats, Ezomyr (a westward swing; these lie north-west of Kingsmarch) |
| 12 town | Lioneye's Watch |
| 13 | Karui Archipelago, Theopolis |
| 14 | Te Onui, Ngamakanui |
| 15 | Cape Awanotui (+ one more is needed) |
| 16 boss | Oriath Harbour (or Theopolis) |

Geographic issues with this draft:
- The north and centre are dense: 30 labels sit between y .24 and .65.
- The south is sparse: only 7 labels below Lioneye's Watch, counting it.
- Step 11 has to go back north-west, and steps 13-15 are thin.
- Moving Lioneye's Watch to step 12 forces this. The alternative is to use Sarn as the step-8 town and Kingsmarch as the step-12 town, and make the end Lioneye's Watch → Karui islands → Oriath.

## 4. Does it reach ~40?

- **38 named labels** on the illustration, plus 2 unlabeled icons that do not qualify.
- If the 5 fixed steps (0, 4, 8, 12, 16) use one node each, the other 12 steps need 24-36 nodes, so a run needs 29-41 nodes in total. 38 fits numerically: with 3 per step the run is 41 and the map is about 3 short. Each step that has 2 nodes lowers the need by one.
- Caveats that shrink the usable count:
  - 6 labels are regions or mountain ranges rather than "places" (Vastiri Plains, Karui Archipelago, Ngamakanui, Northern Ngamakanui, Ezomyr, Phaaryl).
  - 4-5 are mountains (Mt Vastiri, Mt Kalisa, Mt Chuplaigh, Azmerian Ranges, "… Atua Ranges").
  - About 14 labels **could not be found in any game text** (Parima Trading Outpost, Gizem Locks, Burial Towers, Mt Kalisa, Pondium, The Mantle, Lake Constance, Riben Fell, Mt Chuplaigh, … Atua Ranges, Silenus Bluffs, Te Onui, Cape Awanotui, Lira Vaal/Argyr Flats as zones). They are official because GGG drew them, but trivia questions about them would have no in-game anchor.
  - One label is unreadable (… Atua Ranges).
- Realistic gap: if only places with in-game or lore backing count (about 24), the run is roughly 15 short of 40. If every label counts, it is about 2 short at a 40-node target, or none short with ~35 nodes (2-3 per step).

## 5. GGG policy on using the map / item art on a free fan site

There is **no dedicated "fan site / fan content kit" policy** on pathofexile.com that I could find (/media, /press, /fansites all 404). The relevant official texts:

Terms of Use (https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy, "Last Updated: October 2024"):
> "the Rights include without limitation all rights in respect of all graphics, logos, text, images and all other elements included in and deriving from the gameplay and virtual world featured in PoE, including without limitation in-game names, characters, locations and any virtual items"

> "Grinding Gear Games grants you a limited licence ... and the related Rights for your own personal and non-commercial use in accordance with these Terms of Use."

> "Restrictions: Under no circumstances, without the prior written approval of Grinding Gear Games, may you: Adapt, reproduce, store, distribute, print, display, publish or create derivative works from any part of the Website, Materials or Services other than in accordance with the Licence."

> "If you provide a link to the Website you agree that you will not use any Grinding Gear Games logo, trade mark or other proprietary graphic as part of such link without the express prior approval of Grinding Gear Games."

Developer docs, which are aimed at third-party sites and tools (https://www.pathofexile.com/developer/docs/index):
> "As a general rule, we cannot allow our Intellectual Property to be used to generate commercial revenue. This includes creating and selling physical items, or copying our assets to make other games."

> "You may not present your project or tool in a way that could be construed as it being developed or officially authorised by Grinding Gear Games. This includes but is not limited to using our company or game logos in a way that imitates official platforms. Every public or widely available application should include some form of the following statement in a visible location: This product isn't affiliated with or endorsed by Grinding Gear Games in any way."

How this applies (my reading, not legal advice):
- **Strictly, publicly displaying GGG art needs prior written approval.** In practice GGG tolerates non-commercial fan sites, and the community wikis and poe2db host item art, but that is tolerance, not a licence.
- **"Copying our assets to make other games" is named as something GGG won't allow.** That sentence sits under the commercial-revenue rule, but a trivia *game* that uses the map as its board is the closest case to it.
- **This specific map is a commercially licensed Displate product.** The only copies online are Displate's watermarked previews, and Displate's own terms for its images were not checked. This makes the map the riskiest asset to reuse.
- Safer options:
  1. Email GGG for permission.
  2. Draw your own simplified outline and place your own pins at the same relative positions. Names and locations are still GGG IP, but they are facts rather than a reproduction of the artwork.
- In any case: keep the site free (no ads or monetisation), show the "isn't affiliated with or endorsed by Grinding Gear Games" line, and don't use GGG logos.

## Biggest uncertainties
- Whether a clean, non-watermarked official version exists. I found none: no GGG news post or game-file copy.
- Whether the full map appears anywhere in-game. None found.
- Spelling of about 8 labels in the blackletter font, and one unreadable name (… Atua Ranges).
- About 14 labels with no confirmation in game text.
- poe2wiki/poewiki were inaccessible, so wiki pages were not checked.

## Sources (pages actually opened)
- https://displate.com/displate/9211583 (Path of Exile 2 - Map of Wraeclast) and its CDN image
- https://displate.com/licensed/path-of-exile
- https://displate.com/licensed/path-of-exile/chronicles-of-wraeclast
- https://www.pathofexile.com/forum/view-thread/3896623 (New PoE2 Displates announcement)
- https://www.pathofexile.com/forum/view-thread/449437 (Whole Wraeclast island map, 2013)
- https://www.pathofexile.com/forum/view-thread/956896 (Map of Wraeclast, Bex_GGG reply, 2014)
- https://www.pathofexile.com/forum/view-thread/575012 (Lore: Map of Wraeclast, 2013)
- http://static.giantbomb.com/uploads/original/13/130632/2432221-7269184407-path_.jpg (2012 GGG wallpaper map)
- https://www.pathofexile.com/forum/view-thread/3602992 and /3768927 (PoE2 World Map feedback; no map content)
- https://www.pathofexile.com/legal/terms-of-use-and-privacy-policy
- https://www.pathofexile.com/developer/docs/index
- https://poe2db.tw/us/Act_1, /Act_2, /Act_3, /Act_4, /Interlude, /Act_5, /Act_6
- https://poe2db.tw/us/Azmerian_Ranges, /Phaaryl, /Stridevolf, /Ngakanu, /Ngamakanui, /Highgate, /Sarn, /Ezomyr, /Maraketh, /Vastiri, /Azmeri
- https://poedb.tw/us/Phaaryl, https://poedb.tw/us/Stridevolf, https://poedb.tw/us/Wraeclast
- https://pathofexile.fandom.com/wiki/Wraeclast
- https://nerdymaps.com/producto/wraeclast-map-path-of-exile/ (fan map, ruled out)
- Attempted but blocked: poe2wiki.net and poewiki.net pages (Anubis), path-of-exile-2.fandom.com (fetch error)
