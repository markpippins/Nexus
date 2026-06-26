import { Component } from '@angular/core';
import { AvatarComponent } from './avatar/avatar';

@Component({
  selector: 'app-root',
  imports: [AvatarComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {}
