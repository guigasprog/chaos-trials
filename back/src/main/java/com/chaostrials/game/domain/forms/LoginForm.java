package com.chaostrials.game.domain.forms;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LoginForm {

    @Size(max = 125, message = "Erro LoginForm => Campo Email passou do tamanho maximo {max}")
    @NotEmpty(message = "Erro LoginForm => Campo Email não pode ser Nulo ou em Branco")
    private String email;

    @Size(max = 120, message = "Erro LoginForm => Campo Password passou do tamanho maximo {max}")
    @NotEmpty(message = "Erro LoginForm => Campo Password não pode ser Nulo ou em Branco")
    private String password;

    @Size(max = 120, message = "Erro LoginForm => Campo ConfirmPassword passou do tamanho maximo {max}")
    @NotEmpty(message = "Erro LoginForm => Campo ConfirmPassword não pode ser Nulo ou em Branco")
    private String confirmPassword;

}
