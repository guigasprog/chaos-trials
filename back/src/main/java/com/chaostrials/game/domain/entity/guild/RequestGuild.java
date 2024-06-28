package com.chaostrials.game.domain.entity.guild;

import com.chaostrials.game.domain.entity.character.Character;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "request_guild")
public class RequestGuild {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private LocalDateTime dateTimeOfRequest;

    private String description;

    @ManyToOne
    @JoinColumn(name = "uuid_guild")
    private Guild uuidGuild;

    @ManyToOne
    @JoinColumn(name = "uuid_character")
    private Character uuidCharacter;

}
