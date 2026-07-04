import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: 'brn-switch-thumb[hlm],[hlmSwitchThumb]',
	host: { 'data-slot': 'switch-thumb' },
})
export class HlmSwitchThumb {
	constructor() {
		classes(() => 'bg-background dark:data-unchecked:bg-foreground dark:data-checked:bg-primary-foreground rounded-full shadow-sm not-dark:bg-clip-padding group-data-[size=default]/switch:h-4 group-data-[size=default]/switch:w-6 group-data-[size=sm]/switch:h-3 group-data-[size=sm]/switch:w-4 data-unchecked:translate-x-0 data-checked:ltr:translate-x-[calc(100%-8px)] data-checked:rtl:-translate-x-[calc(100%-8px)] pointer-events-none block ring-0 transition-transform');
	}
}
