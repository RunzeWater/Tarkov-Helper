// Interactive map definitions, from the-hideout/tarkov-dev src/data/maps.json (GPL-3.0)
export const MAP_CONFIG = {
 "streets-of-tarkov": {
  "minZoom": 1,
  "maxZoom": 5,
  "transform": [
   0.38,
   0,
   0.38,
   0
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    323,
    -295
   ],
   [
    -280,
    532
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/StreetsOfTarkov.svg"
 },
 "ground-zero": {
  "minZoom": 1,
  "maxZoom": 6,
  "transform": [
   0.524,
   167.3,
   0.524,
   65.1
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    249,
    -124
   ],
   [
    -99,
    364
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/GroundZero.svg",
  "tilePath": "https://assets.tarkov.dev/maps/groundzero/main_summer/{z}/{x}/{y}.png",
  "altMaps": [
   "ground-zero-21"
  ],
  "tileSize": 256
 },
 "customs": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.239,
   168.65,
   0.239,
   136.35
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    698,
    -307
   ],
   [
    -372,
    237
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Customs.svg",
  "tilePath": "https://assets.tarkov.dev/maps/customs_0.16/main/{z}/{x}/{y}.png",
  "tileSize": 256
 },
 "factory": {
  "minZoom": 1,
  "maxZoom": 6,
  "transform": [
   1.629,
   119.9,
   1.629,
   139.3
  ],
  "coordinateRotation": 90,
  "bounds": [
   [
    77,
    -64.5
   ],
   [
    -65.5,
    67.4
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Factory.svg",
  "tilePath": "https://assets.tarkov.dev/maps/factory/main/{z}/{x}/{y}.png",
  "altMaps": [
   "night-factory"
  ],
  "tileSize": 256
 },
 "icebreaker": {
  "minZoom": 1,
  "maxZoom": 5,
  "transform": [
   2.0,
   125.0,
   3.5,
   91.0
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    77,
    -64.5
   ],
   [
    -65.5,
    67.4
   ]
  ],
  "tilePath": "https://assets.tarkov.dev/maps/icebreaker/06_infirmary/{z}/{x}/{y}.png",
  "tileSize": 256
 },
 "interchange": {
  "minZoom": 1,
  "maxZoom": 6,
  "transform": [
   0.265,
   150.6,
   0.265,
   134.6
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    598,
    -442
   ],
   [
    -433,
    426
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Interchange.svg",
  "tilePath": "https://assets.tarkov.dev/maps/interchange/main/{z}/{x}/{y}.png",
  "tileSize": 256
 },
 "the-lab": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.575,
   281.2,
   0.575,
   193.7
  ],
  "coordinateRotation": 270,
  "bounds": [
   [
    -80,
    -477
   ],
   [
    -287,
    -193
   ]
  ],
  "tilePath": "https://assets.tarkov.dev/maps/labs_v4/1st/{z}/{x}/{y}.png",
  "altMaps": [
   "the-lab-dark"
  ],
  "tileSize": 175
 },
 "the-labyrinth": {
  "minZoom": 1,
  "maxZoom": 6,
  "transform": [
   2.115,
   85.5,
   2.115,
   128.0
  ],
  "coordinateRotation": 270,
  "bounds": [
   [
    -52,
    -37
   ],
   [
    53,
    76
   ]
  ],
  "tilePath": "https://assets.tarkov.dev/maps/labyrinth/main/{z}/{x}/{y}.png"
 },
 "lighthouse": {
  "minZoom": 1,
  "maxZoom": 6,
  "transform": [
   0.2,
   0,
   0.2,
   0
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    515,
    -998
   ],
   [
    -545,
    725
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Lighthouse.svg"
 },
 "reserve": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.395,
   122.0,
   0.395,
   137.65
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    289,
    -293
   ],
   [
    -303,
    244
   ]
  ],
  "svgBounds": [
   [
    289,
    -274
   ],
   [
    -303,
    272
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Reserve.svg",
  "tilePath": "https://assets.tarkov.dev/maps/reserve/main/{z}/{x}/{y}.png"
 },
 "shoreline": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.16,
   83.2,
   0.16,
   111.1
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    504,
    -415
   ],
   [
    -1056,
    618
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Shoreline.svg",
  "tilePath": "https://assets.tarkov.dev/maps/shoreline/main_summer/{z}/{x}/{y}.png"
 },
 "terminal": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.2,
   0,
   0.2,
   0
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    463,
    -580
   ],
   [
    -433,
    475
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Terminal.svg"
 },
 "woods": {
  "minZoom": 2,
  "maxZoom": 6,
  "transform": [
   0.1855,
   112.95,
   0.1855,
   167.85
  ],
  "coordinateRotation": 180,
  "bounds": [
   [
    646,
    -914
   ],
   [
    -761,
    442
   ]
  ],
  "svgPath": "https://assets.tarkov.dev/maps/svg/Woods.svg",
  "tilePath": "https://assets.tarkov.dev/maps/woods/main_0.16/{z}/{x}/{y}.png"
 }
};
