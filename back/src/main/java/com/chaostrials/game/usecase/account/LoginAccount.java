package com.chaostrials.game.usecase.account;

import com.chaostrials.game.domain.entity.account.Account;
import com.chaostrials.game.domain.forms.LoginForm;
import com.chaostrials.game.domain.repository.AccountRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
public class LoginAccount {

    @Autowired
    private final AccountRepository accountRepository;

    LoginAccount(AccountRepository accountRepository) {
        this.accountRepository = accountRepository;
    }

    public Account loginAccount(LoginForm loginForm) {
        if(loginForm.getPassword().equals(loginForm.getConfirmPassword())) {
            Optional<Account> account = this.accountRepository.findByEmail(loginForm.getEmail());
            if(account.isPresent()) {
                if(account.get().getPassword()
                        .equals(loginForm.getPassword())) return account.get();
            }
        }
        return null;
    }

}
