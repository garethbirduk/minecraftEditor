# Drive this every tick from a REPEATING command block: function football/tick
# Coords below match the build guide (centre 0,64,0). Adjust to your arena.

# RED scores in BLUE's goal (the -Z end)
execute as @e[type=minecraft:boat,tag=ball,x=-3,dx=6,y=63,dy=4,z=-18,dz=3] run function football/score_red

# BLUE scores in RED's goal (the +Z end)
execute as @e[type=minecraft:boat,tag=ball,x=-3,dx=6,y=63,dy=4,z=15,dz=3] run function football/score_blue
