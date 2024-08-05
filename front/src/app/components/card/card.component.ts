import { Component } from '@angular/core';

@Component({
  standalone: true,
  selector: 'CARD',
  template: `
  <div class="cards">
    <div class="card card-3x4 card-info">
      <div class="content"><h1>Sucesso</h1></div>
    </div>
    <div class="card card-toasty card-warning">
      <div class="content"><h1>Alerta</h1></div>
    </div>
    <div class="card card-toasty card-danger">
      <div class="content"><h1>Perigo</h1></div>
    </div>
    <div class="card card-toasty card-info">
      <div class="content"><h1>Info</h1></div>
    </div>
  </div>

  `,
  styles: `
  .cards {
    display: flex;
    .card {
      margin: 10px;
      display: flex;
      justify-content: center;
      align-items: center;
    }
  }
  `
})
export class CardComponent {

}
