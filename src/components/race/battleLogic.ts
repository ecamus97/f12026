import { rollDice } from "@/data/f1Data";
import { RaceDriverState, BattleInfo, Advantage } from "./types";

export function resolveBattle(
  attacker: RaceDriverState,
  defender: RaceDriverState
): { overtake: boolean; info: BattleInfo } {
  const attackerStat = attacker.driver.overtaking;
  const defenderStat = defender.driver.maintainingPosition;

  const advantage: Advantage =
    attackerStat > defenderStat
      ? "attacker"
      : attackerStat < defenderStat
        ? "defender"
        : "none";

  const attackerRoll1 = rollDice();
  const defenderRoll1 = rollDice();

  const attackerWinsFirst = attackerRoll1 > defenderRoll1;
  const advantagedSideLostOrTied =
    advantage === "attacker"
      ? !attackerWinsFirst
      : advantage === "defender"
        ? attackerWinsFirst
        : false;

  if (advantage !== "none" && advantagedSideLostOrTied) {
    const attackerRoll2 = rollDice();
    const defenderRoll2 = rollDice();
    const attackerWinsSecond = attackerRoll2 > defenderRoll2;

    return {
      overtake: attackerWinsSecond,
      info: {
        attacker: attacker.driver.shortName,
        defender: defender.driver.shortName,
        advantage,
        attackerRoll1,
        defenderRoll1,
        attackerRoll2,
        defenderRoll2,
        result: attackerWinsSecond ? "overtake" : "defend",
      },
    };
  }

  return {
    overtake: attackerWinsFirst,
    info: {
      attacker: attacker.driver.shortName,
      defender: defender.driver.shortName,
      advantage,
      attackerRoll1,
      defenderRoll1,
      result: attackerWinsFirst ? "overtake" : "defend",
    },
  };
}
