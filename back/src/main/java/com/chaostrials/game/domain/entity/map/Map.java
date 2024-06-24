package com.chaostrials.game.domain.entity.map;

import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;

@Getter
@Entity
@Table(schema = "public", name = "map")
public class Map {

    @Id
    private Long id;

    private String nameLocation;

    private Long sizeX;

    private Long sizeY;

    private String image;

}
