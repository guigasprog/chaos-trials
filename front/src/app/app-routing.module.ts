import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { ViewLogin } from './view/login/login.component';
import { CardComponent } from './components/card/card.component';

const routes: Routes = [
  {
    path: 'cards',
    component: CardComponent
  },
  {
    path: '',
    component: ViewLogin
  }
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
