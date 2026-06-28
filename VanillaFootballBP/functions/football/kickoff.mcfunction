# Removes the old ball and spawns a fresh one at centre (0,64,0)
kill @e[type=minecraft:boat,tag=ball]
summon minecraft:boat 0.5 64 0.5
tag @e[type=minecraft:boat] add ball
titleraw @a actionbar {"rawtext":[{"text":"§fKickoff!"}]}
