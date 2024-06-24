package com.chaostrials.game.entrypoint.dto;

import lombok.Getter;

import java.util.List;

@Getter
public class AccountDTO {

    private String username;

    private List<CharacterDTO> characters;

}
