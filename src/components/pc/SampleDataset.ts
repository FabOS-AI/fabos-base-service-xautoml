import * as cpc from "./model";


export namespace SampleData {

    function createNumericalAxis() {
        return new cpc.Axis('3', 'Accuracy', cpc.Type.NUMERICAL, new cpc.Domain(0, 1, false))
    }

    function createConditionalAxis() {
        const axis1 = cpc.Axis.Categorical('1_1_1', 'Type', [
            new cpc.Choice('Quality'),
            new cpc.Choice('Intermediate'),
            new cpc.Choice('Speed', [
                cpc.Axis.Numerical('1_1_1_3_1', 'alpha', new cpc.Domain(0, 1, false)),
                cpc.Axis.Numerical('1_1_1_3_2', 'beta', new cpc.Domain(0, 100, true))
            ]),
        ])
        const axis2 = cpc.Axis.Numerical('1_1_2', 'Holdout', new cpc.Domain(0.001, 0.999, false))
        const axis3 = cpc.Axis.Numerical('1_1_3', 'EstimatorNumber', new cpc.Domain(1, 4, false))

        return cpc.Axis.Categorical('1', 'Configuration', [
            new cpc.Choice('ModelPool', [axis1, axis2, axis3]),
            new cpc.Choice('Disabled')
        ])
    }

    function createLines() {
        const line1 = new cpc.Line('1', [
            new cpc.LinePoint('1', 'Disabled'),
            new cpc.LinePoint('3', 0.667)
        ])
        const line2 = new cpc.Line('2', [
            new cpc.LinePoint('1', 'ModelPool'),
            new cpc.LinePoint('1_1_1', 'Quality'),
            new cpc.LinePoint('1_1_2', 0.334),
            new cpc.LinePoint('1_1_3', 4),
            new cpc.LinePoint('3', 1)
        ])
        const line3 = new cpc.Line('3', [
            new cpc.LinePoint('1', 'ModelPool'),
            new cpc.LinePoint('1_1_1', 'Speed'),
            new cpc.LinePoint('1_1_1_3_1', 0.333),
            new cpc.LinePoint('1_1_1_3_2', 10),
            new cpc.LinePoint('1_1_2', 0.666),
            new cpc.LinePoint('1_1_3', 2),
            new cpc.LinePoint('3', 0.5)
        ])
        const line4 = new cpc.Line('4', [
            new cpc.LinePoint('1', 'ModelPool'),
            new cpc.LinePoint('1_1_1', 'Quality'),
            new cpc.LinePoint('1_1_2', undefined),
            new cpc.LinePoint('1_1_3', undefined),
            new cpc.LinePoint('3', 0.667)
        ])
        const line5 = new cpc.Line('1', [new cpc.LinePoint('1', undefined), new cpc.LinePoint('3', 0.25)])

        return [line1, line2, line3, line4, line5]
    }

    export function createModel(): cpc.Model {
        return new cpc.Model([createConditionalAxis(), createNumericalAxis()], createLines());
    }
}
