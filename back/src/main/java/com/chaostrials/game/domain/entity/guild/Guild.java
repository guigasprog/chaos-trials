package com.chaostrials.game.domain.entity.guild;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "guild")
public class Guild {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private String name;

    private String tag;

    private Long space;

    private Character type;

    private Integer points;

    private Boolean privado;

}
