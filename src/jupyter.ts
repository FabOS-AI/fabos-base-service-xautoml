import {
    ConfigSimilarityResponse,
    FANOVAResponse,
    FeatureImportance,
    GlobalSurrogateResult,
    Label,
    LimeResult,
    LinePoint,
    LocalExplanation,
    OutputDescriptionData,
    PerformanceData,
    RocCurveData
} from "./dao";
import {INotebookTracker, Notebook, NotebookActions} from "@jupyterlab/notebook";
import {TagTool} from "@jupyterlab/celltags";
import {KernelMessage} from "@jupyterlab/services";
import {IError, IExecuteResult, IStream} from '@jupyterlab/nbformat';
import {BO, CandidateId} from "./model";
import {Components} from "./util";
import memoizee from "memoizee";
import SOURCE = Components.SOURCE;

export class ServerError extends Error {

    constructor(public name: string, message: string, public readonly traceback: string[]) {
        super(message);
        super.name = name
    }
}

export class Jupyter {

    private readonly LOCAL_STORAGE_CONTENT = 'xautoml-previousCellContent'
    private readonly TAG_NAME = 'xautoml-generated'
    private previousCellContent: string = undefined;

    constructor(private notebooks: INotebookTracker, private tags: TagTool) {
        this.previousCellContent = localStorage.getItem(this.LOCAL_STORAGE_CONTENT)
    }

    unmount() {
        this.memExecuteCode.clear()
    }

    executeCode<T>(code: string): Promise<T> {
        const sessionContext = this.notebooks.currentWidget.context.sessionContext

        if (!sessionContext || !sessionContext.session?.kernel)
            return new Promise((resolve, reject) => reject('Not connected to kernel'))

        const request = sessionContext.session?.kernel?.requestExecute({code})

        const outputBuffer: string[] = []
        let result: IExecuteResult = undefined
        let error: IError = undefined

        request.onIOPub = (msg: KernelMessage.IIOPubMessage) => {
            const msgType = msg.header.msg_type;
            switch (msgType) {
                case 'error':
                    error = msg.content as IError
                    break
                case 'stream':
                    const text = (msg.content as IStream).text
                    outputBuffer.push(typeof text === 'string' ? text : text.join('\n'))
                    break
                case 'execute_result':
                    result = msg.content as IExecuteResult
                    break
                default:
                    break;
            }
            return;
        }

        return request.done.then(() => {
            console.log(outputBuffer.join('\n'))
            if (error) {
                throw new ServerError(error.ename, error.evalue, error.traceback)
            }
            if (result !== undefined)
                return result.data['application/json'] as unknown as T
            return undefined
        })
    }

    private memExecuteCode = memoizee(this.executeCode, {
        promise: true, primitive: true, length: 1, max: 100
    });

    createCell(content: string = ''): void {
        const current = this.notebooks.currentWidget
        const notebook: Notebook = current.content
        const xautomlCell = notebook.activeCellIndex

        NotebookActions.selectBelow(notebook)
        const currentContent = notebook.activeCell.model.value.text
        if (this.tags.checkApplied(this.TAG_NAME) && currentContent === this.previousCellContent) {
            // Cell was autogenerated and not changed by user.
            NotebookActions.clearOutputs(notebook)
        } else {
            notebook.activeCellIndex = xautomlCell;
            notebook.deselectAll();
            NotebookActions.insertBelow(notebook)
            this.tags.addTag(this.TAG_NAME)
        }

        notebook.activeCell.model.value.text = content
        this.previousCellContent = content
        localStorage.setItem(this.LOCAL_STORAGE_CONTENT, content)

        notebook.activeCell.editor.focus()
    }

    requestPerformanceData(cid: CandidateId): Promise<PerformanceData> {
        return this.memExecuteCode<PerformanceData>(`XAutoMLManager.get_active().performance_data('${cid}')`)
            .then(data => {
                return {
                    duration: data.duration,
                    val_score: data.val_score,
                    accuracy: data.accuracy,
                    cm: data.cm,
                    report: new Map(Object.entries(data.report))
                }
            })
    }

    requestOutputComplete(cid: CandidateId): Promise<OutputDescriptionData> {
        return this.memExecuteCode<OutputDescriptionData>(`XAutoMLManager.get_active().output_complete('${cid}')`)
            .then(data => new Map<string, string>(Object.entries(data)))
    }

    requestOutputDescription(cid: CandidateId): Promise<OutputDescriptionData> {
        return this.memExecuteCode<OutputDescriptionData>(`XAutoMLManager.get_active().output_description('${cid}')`)
            .then(data => new Map<string, string>(Object.entries(data)))
    }

    requestLimeApproximation(cid: CandidateId, idx: number = 0, step: string = SOURCE): Promise<LimeResult> {
        return this.memExecuteCode<LimeResult>(`XAutoMLManager.get_active().lime('${cid}', ${idx}, '${step}')`)
            .then(data => {
                return {
                    idx: data.idx,
                    label: data.label,
                    categorical_input: data.categorical_input,
                    additional_features: data.additional_features,
                    expl: new Map<Label, LocalExplanation>(Object.entries(data.expl)),
                    prob: new Map<Label, number>(Object.entries(data.prob))
                }
            })
    }

    requestGlobalSurrogate(cid: CandidateId, step: string, max_leaf_nodes: number | 'None' = 'None'): Promise<GlobalSurrogateResult> {
        return this.memExecuteCode<GlobalSurrogateResult>(
            `XAutoMLManager.get_active().decision_tree_surrogate('${cid}', '${step}', ${max_leaf_nodes})`
        )
    }

    requestFeatureImportance(cid: CandidateId, step: string = SOURCE): Promise<FeatureImportance> {
        return this.memExecuteCode<FeatureImportance>(
            `XAutoMLManager.get_active().feature_importance('${cid}', '${step}')`
        ).then(data => {
            return {
                data: new Map<string, number>(
                    Object.entries(data.data).map(([key, value]) => [key, value['0']])
                ),
                additional_features: data.additional_features
            }
        })
    }

    requestFANOVA(sid: CandidateId, step: string = 'None'): Promise<FANOVAResponse> {
        return this.memExecuteCode<FANOVAResponse>(
            `XAutoMLManager.get_active().fanova('${sid}', '${step}')`
        )
    }

    requestSimulatedSurrogate(sid: CandidateId, timestamp: number): Promise<BO.Explanation> {
        return this.memExecuteCode<Map<string, Map<string, [number, number][]>>>(
            `XAutoMLManager.get_active().simulate_surrogate('${sid}', ${timestamp})`
        ).then(data => {
                // @ts-ignore
                return BO.Explanation.fromJson({
                    candidates: [],
                    loss: [],
                    marginalization: data,
                    selected: undefined,
                    metric: 'Performance'
                })
            }
        )
    }

    requestConfigSimilarity(): Promise<ConfigSimilarityResponse> {
        return this.memExecuteCode<ConfigSimilarityResponse>(`XAutoMLManager.get_active().config_similarity()`)
    }

    requestROCCurve(cid: CandidateId[]): Promise<RocCurveData> {
        const list = cid.join('\', \'')
        return this.memExecuteCode(`XAutoMLManager.get_active().roc_curve(['${list}'])`)
            .then(data => new Map<string, LinePoint[]>(Object.entries(data)))
    }
}

// Prefix used in python to prevent accidental name clashes
export const ID = 'xautoml'
