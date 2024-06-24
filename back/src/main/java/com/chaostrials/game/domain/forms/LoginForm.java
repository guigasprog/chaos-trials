package com.chaostrials.game.domain.forms;

import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
public class LoginForm {
    
    private String email;

    private String password;

    private String confirmPassword;

}
