package com.chaostrials.game.domain.entity.character;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "stats")
public class Stats {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private Double life;

    private Double mana;

    private Double stamina;

    private Double sanity;

    private Integer armor;

}
