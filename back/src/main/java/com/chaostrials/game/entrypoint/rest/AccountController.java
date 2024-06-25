package com.chaostrials.game.entrypoint.rest;

import com.chaostrials.game.domain.entity.account.Account;
import com.chaostrials.game.domain.forms.LoginForm;
import com.chaostrials.game.usecase.account.LoginAccount;
import jakarta.annotation.Resource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Resource
@RestController
@RequestMapping("/account")
public class AccountController {

    @Autowired
    private LoginAccount loginAccount;

    AccountController(LoginAccount loginAccount) {
        this.loginAccount = loginAccount;
    }

    @GetMapping
    public ResponseEntity<String> login(LoginForm loginForm) {
        return ResponseEntity.ok().body("oi world");
    }

}
