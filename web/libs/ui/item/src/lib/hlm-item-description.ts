import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmItemDescription],hlm-item-description',
	host: { 'data-slot': 'item-description' },
})
export class HlmItemDescription {
	constructor() {
		classes(
			() =>
				'text-muted-foreground text-start text-sm [&>a:hover]:text-primary line-clamp-2 flex font-normal [&>a]:underline [&>a]:underline-offset-4',
		);
	}
}
