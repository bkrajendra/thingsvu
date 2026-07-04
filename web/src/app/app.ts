import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { HlmButtonImports } from '@spartan-ng/helm/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideArrowUpRight } from '@ng-icons/lucide';
@Component({
  selector: 'app-root',
  imports: [RouterOutlet,HlmButtonImports,NgIcon],
  providers: [provideIcons({ lucideArrowUpRight })],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('web');
}
