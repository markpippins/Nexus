import { Routes } from '@angular/router';
import { RolesComponent } from './roles/roles.component';

export const routes: Routes = [
  { path: 'roles', component: RolesComponent },
  { path: '', redirectTo: '/roles', pathMatch: 'full' },
];
