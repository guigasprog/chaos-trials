package com.chaostrials.game.domain.entity.character;

import com.chaostrials.game.domain.entity.item.Item;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

import java.util.UUID;

@Getter
@Setter
@Entity
@Table(schema = "private", name = "inventory")
public class Inventory {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID uuid;

    private Integer amount;

    @ManyToOne
    @JoinColumn(name = "uuid_character")
    private Character character;

    @ManyToOne
    @JoinColumn(name = "uuid_item")
    private Item item;

}
