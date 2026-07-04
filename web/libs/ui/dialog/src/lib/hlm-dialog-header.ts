import { Directive } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';

@Directive({
	selector: '[hlmDialogHeader],hlm-dialog-header',
	host: { 'data-slot': 'dialog-header' },
})
export class HlmDialogHeader {
	constructor() {
		classes(() => 'gap-1.5 flex flex-col');
	}
}
