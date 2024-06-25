package com.chaostrials.game.domain.entity.character;

import com.chaostrials.game.domain.entity.account.Account;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.time.LocalDateTime;
import java.util.List;
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

    private Long level;

    private Double xp;

    @Column(name = "class")
    private Integer classes;

    @Column(name = "last_contact")
    private LocalDateTime lastContact;

    private Integer gold;

    @ManyToOne
    @JoinColumn(name = "uuid_account")
    private Account account;

    @OneToOne
    @JoinColumn(name = "uuid_attribute")
    private Attribute attribute;

    @OneToOne
    @JoinColumn(name = "uuid_stats")
    private Stats stats;

    @ManyToMany
    @JoinTable(
            name = "character_ability",
            joinColumns = @JoinColumn(name = "uuid_character"),
            inverseJoinColumns = @JoinColumn(name = "uuid_ability")
    )
    private List<Ability> abilities;

}
