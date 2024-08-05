import { Component } from '@angular/core';
import { ViewLoginSignIn } from './signin/sign-in.component';

@Component({
  standalone: true,
  selector: 'VIEW-LOGIN',
  template: `
    <div class="mid-container">
      <VIEW-SIGN-IN></VIEW-SIGN-IN>
    </div>
  `,
  styles: `
    .mid-container {
      display: flex;
      justify-content: center;
      align-items: center;
    }
  `,
  imports: [
    ViewLoginSignIn
  ]
})
export class ViewLogin {

}
