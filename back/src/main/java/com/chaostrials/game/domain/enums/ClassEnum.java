package com.chaostrials.game.domain.enums;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public enum ClassEnum {

    WISE(1, "Wise", 0),
    MAGE(11, "Mage", 1),
    ARCANIST(12, "Arcanist", 1),
    SORCERER(13, "Sorcerer", 1),
    ELEMENTALIST(14, "Elementalist", 1),
    ILLUSIONIST(15, "Illusionist", 1),
    CLERIC(16, "Cleric", 1),
    NECROMANCER(17, "Necromancer", 1),
    SUMMONER(18, "Summoner", 1),
    DRUID(19, "Druid", 1),

    SUPPORT(2, "Support", 0),
    BARD(21, "Bard", 2),
    MINSTREL(22, "Minstrel", 2),
    ACROBAT(23, "Acrobat", 2),
    GAMBLER(24, "Gambler", 2),

    RANGER(3, "Ranger", 0),
    ARCHER(31, "Archer",3),
    ALCHEMIST(32, "Alchemist", 3),

    MELEE(4, "Melee", 0),
    WARRIOR(41, "Warrior", 4),
    TEMPLAR(42, "Templar", 4),
    LANCER(43, "Lancer", 4),
    ROGUE(44, "Rogue", 4),
    BERSERK(45, "Berserk", 4);

    private final Integer index;
    private String description;
    private Integer dadClass;

}
