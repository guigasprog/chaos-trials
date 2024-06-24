package com.chaostrials.game.domain.entity.character;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "character")
public class Character {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private String name;

    private Integer classes;

    private LocalDateTime lastContact;

    private UUID uuidAccount;

    private UUID uuidAttribute;

    private UUID uuidStats;

    private UUID uuidAbility;

}
