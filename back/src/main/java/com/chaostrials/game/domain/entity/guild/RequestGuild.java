package com.chaostrials.game.domain.entity.guild;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "request")
public class RequestGuild {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private String description;

    private UUID uuidGuild;

    private UUID uuidCharacter;

}
