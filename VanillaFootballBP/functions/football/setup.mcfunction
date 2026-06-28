# Run once to (re)initialise the match: /function football/setup
scoreboard objectives add football dummy "§eFootball"
scoreboard objectives setdisplay sidebar football
scoreboard players set Red football 0
scoreboard players set Blue football 0
function football/kickoff
tellraw @a {"rawtext":[{"text":"§a⚽ Football ready! Shove the boat into the enemy goal. First to 5 wins."}]}
