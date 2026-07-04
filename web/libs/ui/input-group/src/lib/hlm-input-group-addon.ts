import { Directive, input } from '@angular/core';
import { classes } from '@spartan-ng/helm/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const inputGroupAddonVariants = cva(
	'text-muted-foreground **:data-[slot=kbd]:bg-muted-foreground/10 h-auto gap-2 py-2 text-sm font-medium group-data-[disabled=true]/input-group:opacity-50 **:data-[slot=kbd]:rounded-3xl **:data-[slot=kbd]:px-1.5 [&>ng-icon:not([class*=\'text-\'])]:text-[length:--spacing(4)] flex cursor-text items-center justify-center select-none',
	{
		variants: {
			align: {
				'inline-start': 'ps-3 has-[>button]:-ms-1 has-[>kbd]:-ms-1 order-first',
				'inline-end': 'pe-3 has-[>button]:-me-1 has-[>kbd]:-me-1 order-last',
				'block-start': 'px-3 pt-3 group-has-[>input]/input-group:pt-3.5 [.border-b]:pb-3.5 order-first w-full justify-start',
				'block-end': 'px-3 pb-3 group-has-[>input]/input-group:pb-3.5 [.border-t]:pt-3.5 order-last w-full justify-start',
			},
		},
		defaultVariants: {
			align: 'inline-start',
		},
	},
);

type InputGroupAddonVariants = VariantProps<typeof inputGroupAddonVariants>;

@Directive({
	selector: '[hlmInputGroupAddon],hlm-input-group-addon',
	host: {
		role: 'group',
		'data-slot': 'input-group-addon',
		'[attr.data-align]': 'align()',
	},
})
export class HlmInputGroupAddon {
	public readonly align = input<InputGroupAddonVariants['align']>('inline-start');

	constructor() {
		classes(() => inputGroupAddonVariants({ align: this.align() }));
	}
}
