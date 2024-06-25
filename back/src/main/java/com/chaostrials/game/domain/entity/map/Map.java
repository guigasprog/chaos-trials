package com.chaostrials.game.domain.entity.map;

import jakarta.persistence.Column;
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

    @Column(name = "name_location")
    private String nameLocation;

    @Column(name = "size_x")
    private Long sizeX;

    @Column(name = "size_y")
    private Long sizeY;

    @Column(name = "position_x")
    private Long positionX;

    @Column(name = "position_y")
    private Long positionY;

    private String image;

}
