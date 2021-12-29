import itertools as it
import tempfile
from collections import defaultdict

import numpy as np
import pandas as pd
from ConfigSpace import CategoricalHyperparameter, ConfigurationSpace, Configuration
from ConfigSpace.hyperparameters import OrdinalHyperparameter, NumericalHyperparameter, Optional
from fanova import fANOVA, visualizer

from xautoml.util import io_utils
from xautoml.util.constants import NUMBER_PRECISION, SOURCE, SINK


class HPImportance:

    @staticmethod
    def calculate_fanova_overview(f: fANOVA, X: pd.DataFrame, step: str = None,
                                  filter_: Optional[ConfigurationSpace] = None, n_head: int = 14):
        res = {}

        keys = list(zip(range(len(X.columns)), range(len(X.columns)))) + list(it.combinations(range(len(X.columns)), 2))

        for i, j in keys:
            i_name = f.cs.get_hyperparameter_by_idx(i)
            j_name = f.cs.get_hyperparameter_by_idx(j)
            try:
                if (
                    filter_ is None or (
                    filter_.get_hyperparameter(i_name) and
                    filter_.get_hyperparameter(j_name))
                ):
                    d = f.quantify_importance((i, j))
                else:
                    d = {}  # Never reached, only for typechecker
            except KeyError:
                continue
            except RuntimeError:
                imp = {'individual importance': 0.5, 'individual std': 0, 'total importance': 0.5, 'total std': 0}
                d = {(i,): imp, (j,): imp, (i, j): imp}
            res[(i_name, i_name)] = {
                'importance': d[(i,)]['individual importance'],
                'std': d[(i,)]['individual std']
            }
            res[(j_name, j_name)] = {
                'importance': d[(j,)]['individual importance'],
                'std': d[(j,)]['individual std']
            }
            res[(i_name, j_name)] = {
                'importance': d[(i, j)]['total importance'],
                'std': d[(i, j)]['total std']
            }
        df = pd.DataFrame(res).T

        df['lower'] = (df['importance'] - df['std']).clip(lower=0)
        df['upper'] = (df['importance'] + df['std']).clip(upper=1)

        df = df.round(NUMBER_PRECISION)

        df['std'] = list(zip((df['importance'] - df['lower']).round(NUMBER_PRECISION),
                             (df['upper'] - df['importance']).round(NUMBER_PRECISION)))

        df = df.sort_values('importance', ascending=False)

        if step is not None and step not in (SOURCE, SINK):
            # Move all rows with hyperparameters from the selected step to top of DataFrame
            active_columns = [col for col in X.columns if col.startswith(step)]
            top_rows = df.index.map(lambda t: t[0] in active_columns or t[1] in active_columns) \
                .astype(float).to_series().reset_index(drop=True)
            df = df.iloc[top_rows.sort_values(ascending=False, kind='stable').index, :]
            df = df.head(int(top_rows.sum()))
        else:
            df = df.head(n_head)

        df['idx'] = range(0, df.shape[0])
        remaining_hp_names = np.unique(np.array(df.index.to_list()).flatten())

        return {
            'hyperparameters': remaining_hp_names.tolist(),
            'keys': df.index.tolist(),
            'importance': df[['importance', 'std', 'idx']].to_dict('records'),
        }

    @staticmethod
    def calculate_fanova_details(f: fANOVA, X: pd.DataFrame, resolution: int = 10, hps: list[tuple[str, str]] = None):
        with tempfile.TemporaryDirectory() as tmp:
            vis = visualizer.Visualizer(f, f.cs, tmp)

            if hps is None:
                keys = list(zip(range(len(X.columns)), range(len(X.columns)))) + list(
                    it.combinations(range(len(X.columns)), 2))
            else:
                keys = list(map(lambda t: (f.cs.get_idx_by_hyperparameter_name(t[0]),
                                           f.cs.get_idx_by_hyperparameter_name(t[1])), hps))

            res: dict[int, dict[int, dict]] = defaultdict(dict)
            for i, j in keys:
                i_name = f.cs.get_hyperparameter_by_idx(i)
                j_name = f.cs.get_hyperparameter_by_idx(j)

                if i == j:
                    res[i_name][j_name] = HPImportance._get_plot_data(vis, i, resolution=resolution)
                else:
                    res[i_name][j_name] = HPImportance._get_pairwise_plot_data(vis, (i, j), resolution=resolution)
                    res[j_name][i_name] = res[i_name][j_name]
            return res

    @staticmethod
    def simulate_surrogate(f: fANOVA, X: pd.DataFrame, resolution: int = 10) -> dict:
        with tempfile.TemporaryDirectory() as tmp:
            vis = visualizer.Visualizer(f, f.cs, tmp)

            res = {}
            for i in range(len(X.columns)):
                data = HPImportance._get_plot_data(vis, i, resolution=resolution)
                name, mode, data = data['name'][0], data['mode'], data['data']

                res[name] = {}
                if mode == 'continuous':
                    res[name]['simulated'] = [[d['x'], d['y']] for d in data]
                elif mode == 'discrete':
                    res[name]['simulated'] = [[i, d[0]] for i, d in enumerate(data.values())]
                else:
                    raise ValueError('Unknown mode {}'.format(mode))

            return res

    @staticmethod
    def _get_plot_data(vis: visualizer.Visualizer,
                       idx: int,
                       resolution: int = 10) -> dict:
        name = vis.cs.get_hyperparameter_names()[idx]
        hp = vis.cs.get_hyperparameter(name)

        if isinstance(hp, NumericalHyperparameter):
            mean, std, grid = vis.generate_marginal(idx, resolution)

            df = pd.DataFrame(np.stack((grid, mean, mean + std, mean - std)).T, columns=['x', 'y', 'lower', 'upper']) \
                .round(NUMBER_PRECISION)
            df['area'] = list(zip(df['lower'], df['upper']))
            return {
                'name': [name],
                'data': df[['x', 'y', 'area']].to_dict('records'),
                'mode': 'continuous'
            }
        else:
            if isinstance(hp, CategoricalHyperparameter):
                labels = hp.choices
            elif isinstance(hp, OrdinalHyperparameter):
                labels = hp.sequence
            else:
                raise ValueError("Parameter {} of type {} not supported.".format(hp.name, type(hp)))

            mean, std = vis.generate_marginal(idx)
            d = {}
            for m, s, l in zip(mean, std, labels):
                d[l] = [round(m - s, NUMBER_PRECISION), round(m + s, NUMBER_PRECISION)]
            return {'name': [name], 'data': d, 'mode': 'discrete'}

    @staticmethod
    def _get_pairwise_plot_data(vis: visualizer.Visualizer, idx: (int, int), resolution: int = 10) -> dict:
        name1 = vis.cs.get_hyperparameter_names()[idx[0]]
        hp1 = vis.cs.get_hyperparameter(name1)

        name2 = vis.cs.get_hyperparameter_names()[idx[1]]
        hp2 = vis.cs.get_hyperparameter(name2)

        if isinstance(hp1, NumericalHyperparameter) and isinstance(hp2, NumericalHyperparameter):
            [x, y], z = vis.generate_pairwise_marginal(idx, resolution)
            df = pd.DataFrame(z, columns=np.round(y, decimals=NUMBER_PRECISION),
                              index=np.round(x, decimals=NUMBER_PRECISION))
            return {'name': [name1, name2], 'data': df.round(NUMBER_PRECISION).to_dict(), 'mode': 'heatmap'}
        elif isinstance(hp1, NumericalHyperparameter) or isinstance(hp2, NumericalHyperparameter):
            # Ensure that categorical parameter is always the first index
            if isinstance(hp1, NumericalHyperparameter):
                idx = list(reversed(idx))
                name1, name2 = name2, name1

            [categories, x], y = vis.generate_pairwise_marginal(idx, resolution)
            df = pd.DataFrame(np.vstack((x, y)).T, columns=['x'] + list(categories))
            return {'name': [name1, name2], 'data': df.round(NUMBER_PRECISION).to_dict('records'), 'mode': 'continuous'}
        else:
            [cat1, cat2], z = vis.generate_pairwise_marginal(idx)
            df = pd.DataFrame(z, columns=cat2, index=cat1)
            return {'name': [name1, name2], 'data': df.round(NUMBER_PRECISION).to_dict(), 'mode': 'heatmap'}

    @staticmethod
    def construct_fanova(cs: ConfigurationSpace, configs: list[Configuration], performances: np.ndarray):
        y = performances.astype(float)
        pruned_cs, X = io_utils.configs_as_dataframe(cs, configs)
        f = fANOVA(X, y, config_space=pruned_cs)
        return f, X
