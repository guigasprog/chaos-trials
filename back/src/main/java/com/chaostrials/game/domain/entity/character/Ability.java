package com.chaostrials.game.domain.entity.character;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "public", name = "ability")
public class Ability {
    
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private String description;

    private String effect;

    @Column(name = "permitted_level")
    private Long permittedLevel;

    @Column(name = "class")
    private Integer classes;

}
