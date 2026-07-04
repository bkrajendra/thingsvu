import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: 'kbd[hlmKbd]',
	host: {
		'data-slot': 'kbd',
	},
})
export class HlmKbd {
	constructor() {
		classes(() => 'bg-muted text-muted-foreground in-data-[slot=tooltip-content]:bg-background/20 in-data-[slot=tooltip-content]:text-background dark:in-data-[slot=tooltip-content]:bg-background/10 in-data-[slot=input-group]:bg-input h-5.5 w-fit min-w-5.5 gap-1 rounded-lg px-1.5 font-sans text-xs font-medium [&_ng-icon:not([class*=\'text-\'])]:text-[length:--spacing(3)] pointer-events-none inline-flex items-center justify-center select-none');
	}
}
