package com.chaostrials.game.entrypoint.dto;

import com.chaostrials.game.domain.entity.character.Ability;
import com.chaostrials.game.domain.entity.character.Attribute;
import com.chaostrials.game.domain.entity.character.Character;
import com.chaostrials.game.domain.entity.character.Stats;
import com.chaostrials.game.domain.enums.ClassEnum;
import lombok.Getter;

import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.UUID;

@Getter
public class CharacterDTO {

    private UUID uuid;

    private String name;

    private Long level;

    private Double xp;

    private ClassEnum classes;

    private String lastContact;

    private Stats stats;

    private Attribute attribute;

    private List<Ability> abilities;

    CharacterDTO(Character character, Stats stats, Attribute attribute, List<Ability> abilities) {
        this.uuid = character.getUuid();
        this.name = character.getName();
        this.level = character.getLevel();
        this.xp = character.getXp();
        this.classes = ClassEnum.valueOf("character.getClasses()");
        this.lastContact = character.getLastContact().format(DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"));
        this.stats = stats;
        this.attribute = attribute;
        this.abilities = abilities;
    }

}
