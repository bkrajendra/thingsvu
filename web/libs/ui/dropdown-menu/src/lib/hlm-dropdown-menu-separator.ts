import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmDropdownMenuSeparator],hlm-dropdown-menu-separator',
	host: { 'data-slot': 'dropdown-menu-separator' },
})
export class HlmDropdownMenuSeparator {
	constructor() {
		classes(() => 'bg-border/50 -mx-1.5 my-1.5 h-px block');
	}
}
